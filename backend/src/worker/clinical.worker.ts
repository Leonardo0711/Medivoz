import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Worker } from "bullmq";
import { OpenAI } from "openai";
import { env } from "../config/env.js";
import { redisConnection } from "../config/redis.js";
import { logger } from "../core/utils/logger.js";
import { db } from "../db/index.js";
import { agentExecutions, agentTemplates, doctorAgentPrompts, doctorAgents } from "../db/schema/agents.js";
import { consultations } from "../db/schema/clinical.js";
import { medicalRecordSections, transcriptionSegments } from "../db/schema/scribe.js";
import { agentsService } from "../modules/agents/agents.service.js";
import { audioTemporalService } from "../modules/scribe/audio-temporal.service.js";
import { scribeService } from "../modules/scribe/scribe.service.js";
import { transcriptionSegmentService } from "../modules/scribe/transcription-segment.service.js";
import { ClinicalExtractionJobData, clinicalExtractionQueue } from "./clinical.queue.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const workerConcurrency = Math.max(
  1,
  Number.parseInt(process.env.CLINICAL_WORKER_CONCURRENCY ?? "4", 10) || 4
);

const sectionNames = [
  "motivo_consulta",
  "tiempo_enfermedad",
  "forma_inicio",
  "curso_enfermedad",
  "historia_cronologica",
  "antecedentes",
  "sintomas_principales",
  "estado_funcional_basal",
  "estudios_previos",
  "notas_adicionales",
] as const;

type SectionName = (typeof sectionNames)[number];

type ExtractionValue = {
  texto: string;
  resumen?: string;
  confianza?: number | string | null;
  evidenciaSegmentos?: number[];
  origenDato?: string | null;
};

type AnamnesisPhaseStatus =
  | "no_iniciada"
  | "en_anamnesis"
  | "probable_cierre"
  | "cerrada"
  | "reabierta";

type AnamnesisPhaseDetection = {
  estado: AnamnesisPhaseStatus;
  confianza: number;
  segmentoFinProbable?: number | null;
  razon?: string | null;
};

const keywordMap: Array<{ section: SectionName; words: string[] }> = [
  { section: "motivo_consulta", words: ["motivo", "consulta", "queja", "principal", "dolor", "molestia", "sintoma"] },
  { section: "tiempo_enfermedad", words: ["hace", "dias", "semanas", "meses", "desde"] },
  { section: "curso_enfermedad", words: ["empeora", "mejora", "progres", "evolucion", "curso"] },
  { section: "forma_inicio", words: ["inicio", "comenzo", "repentino", "subito", "insidioso"] },
  { section: "historia_cronologica", words: ["inicio", "comenzo", "luego", "despues", "primero", "cronolog"] },
  { section: "antecedentes", words: ["antecedente", "cirugia", "medicacion", "alergia", "familia"] },
  { section: "sintomas_principales", words: ["sintoma", "fiebre", "tos", "nausea", "cefalea"] },
  { section: "estado_funcional_basal", words: ["camina", "independ", "funcional", "actividades"] },
  { section: "estudios_previos", words: ["examen", "laboratorio", "tomografia", "radiografia", "ecografia"] },
  { section: "notas_adicionales", words: ["nota", "observacion", "adicional", "comentario"] },
];

const compactTranscriptionForExtraction = (transcript: string) => {
  const normalized = transcript.replace(/\r/g, "").trim();
  if (!normalized) return "";

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const compactLines: string[] = [];
  let prev = "";
  for (const line of lines) {
    if (line !== prev) compactLines.push(line);
    prev = line;
  }

  const compact = compactLines.join("\n");
  const maxChars = 7000;
  if (compact.length <= maxChars) return compact;

  const head = compact.slice(0, 4200);
  const tail = compact.slice(-2500);
  return `${head}\n[...CONTENIDO RECORTADO POR LONGITUD...]\n${tail}`;
};

const inferSections = (text: string): SectionName[] => {
  const lower = text.toLowerCase();
  const found = new Set<SectionName>();

  for (const entry of keywordMap) {
    if (entry.words.some((word) => lower.includes(word))) {
      found.add(entry.section);
    }
  }

  if (!found.size) {
    logger.info("[clinical-worker] infer-sections:fallback", {
      transcriptChars: text.length,
      sections: ["motivo_consulta", "historia_cronologica", "sintomas_principales"],
    });
    return ["motivo_consulta", "historia_cronologica", "sintomas_principales"];
  }

  if (
    found.has("tiempo_enfermedad") ||
    found.has("forma_inicio") ||
    found.has("curso_enfermedad") ||
    found.has("sintomas_principales")
  ) {
    found.add("motivo_consulta");
    found.add("historia_cronologica");
    found.add("sintomas_principales");
  }

  const inferred = Array.from(found).slice(0, 6);
  logger.info("[clinical-worker] infer-sections:matched", {
    transcriptChars: text.length,
    sections: inferred,
  });
  return inferred;
};

const parseSection = (raw: string | null | undefined): SectionName | null => {
  const value = String(raw || "").trim() as SectionName;
  return sectionNames.includes(value) ? value : null;
};

const estimateGpt4oMiniCostUsd = (inputTokens?: number | null, outputTokens?: number | null) => {
  const input = Number(inputTokens || 0);
  const output = Number(outputTokens || 0);
  if (!input && !output) return null;
  const usd = (input / 1_000_000) * 0.15 + (output / 1_000_000) * 0.6;
  return usd.toFixed(6);
};

const parseExtractionValue = (raw: unknown): ExtractionValue => {
  if (typeof raw === "string") return { texto: raw };
  if (!raw || typeof raw !== "object") return { texto: "" };

  const value = raw as Record<string, unknown>;
  const evidence = Array.isArray(value.evidencia_segmentos)
    ? value.evidencia_segmentos
    : Array.isArray(value.evidenciaSegmentos)
      ? value.evidenciaSegmentos
      : [];

  return {
    texto: String(value.texto || value.valor || ""),
    resumen: typeof value.resumen === "string" ? value.resumen : "",
    confianza:
      typeof value.confianza === "number" || typeof value.confianza === "string"
        ? value.confianza
        : null,
    evidenciaSegmentos: evidence
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0),
    origenDato: typeof value.origen_dato === "string" ? value.origen_dato : null,
  };
};

const parseAnamnesisPhaseDetection = (raw: unknown): AnamnesisPhaseDetection | null => {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const allowed: AnamnesisPhaseStatus[] = [
    "no_iniciada",
    "en_anamnesis",
    "probable_cierre",
    "cerrada",
    "reabierta",
  ];
  const estado = typeof value.estado === "string" && allowed.includes(value.estado as AnamnesisPhaseStatus)
    ? value.estado as AnamnesisPhaseStatus
    : null;
  if (!estado) return null;

  const rawConfidence = Number(value.confianza ?? 0);
  const confianza = Number.isFinite(rawConfidence)
    ? Math.max(0, Math.min(1, rawConfidence))
    : 0;
  const rawSegment = Number(value.segmento_fin_probable ?? value.segmentoFinProbable ?? 0);

  return {
    estado,
    confianza,
    segmentoFinProbable: Number.isFinite(rawSegment) && rawSegment > 0 ? rawSegment : null,
    razon: typeof value.razon === "string" ? value.razon.slice(0, 600) : null,
  };
};

const shouldApplyAnamnesisPhase = (
  current: AnamnesisPhaseStatus | null | undefined,
  detection: AnamnesisPhaseDetection
) => {
  const status = current || "no_iniciada";
  if (detection.confianza < 0.65) return false;
  if (status === "cerrada" && detection.estado === "en_anamnesis" && detection.confianza >= 0.78) return true;
  if (status === "cerrada" && detection.estado !== "reabierta") return false;
  if (detection.estado === "no_iniciada" && status !== "no_iniciada") return false;
  return true;
};

const updateAnamnesisPhase = async (
  consultaId: string,
  currentStatus: AnamnesisPhaseStatus | null | undefined,
  detection: AnamnesisPhaseDetection,
  segmentoDesde: number,
  segmentoHasta: number
) => {
  if (!shouldApplyAnamnesisPhase(currentStatus, detection)) {
    logger.info("[clinical-worker] anamnesis-phase:skip", {
      consultaId,
      currentStatus,
      detectedStatus: detection.estado,
      confidence: detection.confianza,
    });
    return;
  }

  const nextStatus =
    currentStatus === "cerrada" && detection.estado === "en_anamnesis"
      ? "reabierta"
      : detection.estado;
  const probableEnd = detection.segmentoFinProbable || segmentoHasta;
  const updateValues: Partial<typeof consultations.$inferInsert> = {
    estadoAnamnesis: nextStatus,
    confianzaCierreAnamnesis: String(detection.confianza),
    motivoCierreAnamnesis: detection.razon || null,
    anamnesisDetectadaEn: new Date(),
    updatedAt: new Date(),
  };

  if (nextStatus !== "no_iniciada") {
    updateValues.segmentoInicioAnamnesis = segmentoDesde;
  }
  if (nextStatus === "probable_cierre" || nextStatus === "cerrada") {
    updateValues.segmentoFinAnamnesis = probableEnd;
  }

  await db.update(consultations).set(updateValues).where(eq(consultations.id, consultaId));
  logger.info("[clinical-worker] anamnesis-phase:updated", {
    consultaId,
    previousStatus: currentStatus || "no_iniciada",
    nextStatus,
    confidence: detection.confianza,
    segmentoFinProbable: probableEnd,
    reasonChars: detection.razon?.length || 0,
  });
};

const resolveSegmentRange = async (consultaId: string, from?: number | null, to?: number | null) => {
  const safeFrom = Number(from || 0);
  const safeTo = Number(to || 0);

  if (safeFrom > 0 && safeTo > 0) {
    return {
      segmentoDesde: Math.min(safeFrom, safeTo),
      segmentoHasta: Math.max(safeFrom, safeTo),
    };
  }

  const rows = await db
    .select({
      maxSequence: sql<number>`coalesce(max(${transcriptionSegments.numeroSecuencia}), 0)`,
    })
    .from(transcriptionSegments)
    .where(eq(transcriptionSegments.consultaId, consultaId));

  const maxSequence = Number(rows[0]?.maxSequence || 0);
  if (!maxSequence) {
    return { segmentoDesde: 0, segmentoHasta: 0 };
  }

  return {
    segmentoDesde: Math.max(1, maxSequence - 35),
    segmentoHasta: maxSequence,
  };
};

const fetchTranscriptRange = async (consultaId: string, from: number, to: number) => {
  if (!from || !to || to < from) return { text: "", maxSequence: 0, bySequence: new Map<number, any>() };

  const rows = await db
    .select({
      id: transcriptionSegments.id,
      texto: transcriptionSegments.texto,
      sequence: transcriptionSegments.numeroSecuencia,
      hablante: transcriptionSegments.hablante,
      inicioMs: transcriptionSegments.inicioMs,
      finMs: transcriptionSegments.finMs,
    })
    .from(transcriptionSegments)
    .where(
      and(
        eq(transcriptionSegments.consultaId, consultaId),
        gte(transcriptionSegments.numeroSecuencia, from),
        lte(transcriptionSegments.numeroSecuencia, to)
      )
    )
    .orderBy(asc(transcriptionSegments.numeroSecuencia));

  const text = rows
    .map((row) => {
      const start = row.inicioMs === null || row.inicioMs === undefined ? "?" : row.inicioMs;
      const end = row.finMs === null || row.finMs === undefined ? "?" : row.finMs;
      return `[segmento ${row.sequence}][${row.hablante}][${start}-${end}ms] ${row.texto}`;
    })
    .filter(Boolean)
    .join("\n");
  const maxSequence = rows[rows.length - 1]?.sequence || 0;
  const bySequence = new Map(rows.map((row) => [Number(row.sequence), row]));
  return { text, maxSequence, bySequence };
};

const buildPrompt = (
  sections: SectionName[],
  transcript: string,
  previousValues: Partial<Record<SectionName, string>>,
  baseInstruction?: string | null
) => {
  const sectionsList = sections.join(", ");
  const previousBlock = sections
    .map((section) => `${section}: ${previousValues[section] || ""}`)
    .join("\n");

  return `${baseInstruction?.trim() || "Extrae anamnesis clinica desde la transcripcion."}

Devuelve SOLO un JSON valido con estas claves exactas: ${sectionsList}, _meta_anamnesis.
Cada clave clinica debe ser un objeto con esta forma:
{
  "texto": "dato clinico redactado",
  "resumen": "parrafo breve que el medico podria copiar a su plataforma oficial",
  "confianza": 0.0,
  "evidencia_segmentos": [numero_de_segmento],
  "origen_dato": "referido_paciente|dicho_familiar|indicado_medico|no_determinado"
}
La clave _meta_anamnesis debe tener esta forma:
{
  "estado": "no_iniciada|en_anamnesis|probable_cierre|cerrada|reabierta",
  "confianza": 0.0,
  "segmento_fin_probable": numero_de_segmento_o_null,
  "razon": "explicacion breve"
}

Reglas obligatorias:
- No inventes, no diagnostiques y no completes datos ausentes.
- Si no hay evidencia textual clara para una clave, usa texto "" y confianza 0.
- Cada texto no vacio debe tener al menos un numero en evidencia_segmentos.
- Si texto esta vacio, resumen tambien debe estar vacio.
- Convierte el lenguaje oral en redaccion clinica profesional, clara, breve y en tercera persona.
- Nunca copies literalmente primera persona como "tengo", "me duele" o "ya voy dos semanas". Redacta, por ejemplo: "Paciente refiere tos seca de dos semanas de evolucion".
- Elimina muletillas, repeticiones y frases conversacionales sin perder sintomas, tiempos, intensidad, dosis, fechas ni negaciones.
- No conviertas lo referido en un diagnostico. Usa expresiones como "Paciente refiere", "segun familiar" o "se indica" cuando corresponda.
- motivo_consulta debe expresar la razon clinica principal en una frase breve; tiempo_enfermedad debe contener solo la duracion normalizada; historia_cronologica debe integrar la evolucion en orden temporal.
- Integra el contexto actual con los segmentos nuevos y devuelve el contenido clinico COMPLETO y actualizado de cada seccion, no solo la ultima frase escuchada.
- Conserva informacion previa sustentada. Solo corrigela o reemplazala cuando los nuevos segmentos la aclaren o contradigan.
- El resumen debe ser narrativo, corto y fiel al texto, con el estilo que el medico podria copiar a su plataforma institucional.
- Manten negaciones clinicas tal como fueron dichas.
- Para _meta_anamnesis marca "probable_cierre" o "cerrada" solo si el dialogo cambia claramente hacia examen fisico, revision de resultados, diagnostico, tratamiento, indicaciones, recetas, plan o despedida.
- Si aun hay preguntas sobre sintomas, antecedentes, tiempo de enfermedad o historia actual, usa "en_anamnesis".
- Si no hay informacion suficiente sobre la fase, usa el estado mas conservador y confianza baja.

Contexto actual de secciones:
${previousBlock}

Nuevos segmentos de transcripcion:
${transcript}`;
};

const resolveExtractorAgent = async (doctorId: string) => {
  await agentsService.ensureDefaultAgents(doctorId);

  const [row] = await db
    .select({
      agenteDoctorId: doctorAgents.id,
      versionPromptDoctorId: doctorAgentPrompts.id,
      prompt: doctorAgentPrompts.textoPrompt,
      model: doctorAgentPrompts.nombreModelo,
      temperature: doctorAgentPrompts.temperatura,
    })
    .from(doctorAgents)
    .innerJoin(agentTemplates, eq(agentTemplates.id, doctorAgents.plantillaAgenteId))
    .innerJoin(
      doctorAgentPrompts,
      and(
        eq(doctorAgentPrompts.agenteDoctorId, doctorAgents.id),
        eq(doctorAgentPrompts.esActiva, true)
      )
    )
    .where(
      and(
        eq(doctorAgents.doctorId, doctorId),
        eq(doctorAgents.estado, "activo"),
        eq(doctorAgents.usarEnConsultaEnVivo, true),
        eq(agentTemplates.tipo, "extractor")
      )
    )
    .orderBy(doctorAgents.prioridad, desc(doctorAgentPrompts.numeroVersion))
    .limit(1);

  logger.info("[clinical-worker] extractor-agent:resolved", {
    doctorId,
    found: Boolean(row),
    agentId: row?.agenteDoctorId || null,
    promptVersionId: row?.versionPromptDoctorId || null,
    model: row?.model || null,
    temperature: row?.temperature || null,
  });
  return row || null;
};

const cleanupIntervalMs = Math.max(60_000, env.AUDIO_TEMP_CLEANUP_INTERVAL_MS || 300_000);
const versionDriftMax = Math.max(5, env.EXTRACTION_VERSION_DRIFT_MAX || 60);

const runAudioCleanup = async () => {
  try {
    const result = await audioTemporalService.cleanupExpiredAudios(60);
    if (result.scanned > 0) {
      logger.info("Audio temporal cleanup tick:", result);
    }
  } catch (error) {
    logger.error("Audio temporal cleanup tick failed:", error);
  }
};

void runAudioCleanup();
setInterval(() => {
  void runAudioCleanup();
}, cleanupIntervalMs).unref();

export const clinicalWorker = new Worker<ClinicalExtractionJobData>(
  "clinical-extraction",
  async (job) => {
    const { consultaId, segmentoDesde, segmentoHasta, seccionObjetivo, versionTranscripcionBase } = job.data;
    logger.info(`Processing clinical extraction for consultation: ${consultaId}`);

    const consultation = await db.query.consultations.findFirst({
      columns: {
        id: true,
        pacienteId: true,
        doctorId: true,
        versionTranscripcion: true,
        transcripcion: true,
        estadoAnamnesis: true,
      },
      where: eq(consultations.id, consultaId),
    });

    if (!consultation) {
      logger.warn(`Clinical extraction skipped. Consultation not found: ${consultaId}`);
      return;
    }

    const baseVersion = Number(versionTranscripcionBase || 0);
    const currentVersion = Number(consultation.versionTranscripcion || 0);
    if (baseVersion > 0 && currentVersion - baseVersion > versionDriftMax) {
      logger.warn(
        `Clinical extraction skipped due to stale version (consulta=${consultaId}, base=${baseVersion}, current=${currentVersion})`
      );
      return;
    }

    let range = await resolveSegmentRange(consultaId, segmentoDesde, segmentoHasta);
    if (!range.segmentoDesde || !range.segmentoHasta) {
      const fallbackTranscript = (consultation.transcripcion || "").trim();
      if (fallbackTranscript) {
        const segmentResult = await transcriptionSegmentService.ensureSegmentsFromTranscript({
          consultaId,
          transcript: fallbackTranscript,
          origin: "fusion_sistema",
          replaceConsultationTranscript: false,
        });
        logger.info("[clinical-worker] fallback-segments-from-consultation", {
          consultaId,
          inserted: segmentResult.inserted,
          maxSequence: segmentResult.maxSequence,
        });
        range = await resolveSegmentRange(consultaId, segmentoDesde, segmentoHasta || segmentResult.maxSequence);
      }
    }
    if (!range.segmentoDesde || !range.segmentoHasta) {
      logger.warn(`Clinical extraction skipped because there are no transcript segments: ${consultaId}`);
      return;
    }

    const transcriptSlice = await fetchTranscriptRange(
      consultaId,
      range.segmentoDesde,
      range.segmentoHasta
    );

    const compactTranscript = compactTranscriptionForExtraction(transcriptSlice.text);
    if (!compactTranscript) {
      logger.warn(`Clinical extraction skipped because transcript slice is empty: ${consultaId}`);
      return;
    }

    const explicitSection = parseSection(seccionObjetivo);
    const targetSections = explicitSection ? [explicitSection] : inferSections(compactTranscript);
    logger.info("[clinical-worker] target-sections", {
      consultaId,
      explicitSection,
      targetSections,
      compactTranscriptChars: compactTranscript.length,
    });

    const record = await scribeService.getOrCreateRecord(consultaId, {
      pacienteId: consultation.pacienteId,
      doctorId: consultation.doctorId,
    });

    const existingRows = await db
      .select({
        nombre: medicalRecordSections.nombre,
        textoActual: medicalRecordSections.textoActual,
        textoSugeridoIa: medicalRecordSections.textoSugeridoIa,
      })
      .from(medicalRecordSections)
      .where(
        and(
          eq(medicalRecordSections.fichaId, record.id),
          inArray(medicalRecordSections.nombre, targetSections)
        )
      );

    const existingMap = new Map<SectionName, string>();
    for (const row of existingRows) {
      existingMap.set(
        row.nombre as SectionName,
        row.textoActual || row.textoSugeridoIa || ""
      );
    }

    const extractorAgent = await resolveExtractorAgent(consultation.doctorId);
    const model = extractorAgent?.model || "gpt-4o-mini";
    const temperature = String(extractorAgent?.temperature ?? "0");
    const numericTemperature = Number.parseFloat(temperature) || 0;

    const prompt = buildPrompt(
      targetSections,
      compactTranscript,
      Object.fromEntries(existingMap.entries()) as Partial<Record<SectionName, string>>,
      extractorAgent?.prompt
    );

    const startedAt = new Date();
    const [execution] = await db
      .insert(agentExecutions)
      .values({
        consultaId,
        agenteDoctorId: extractorAgent?.agenteDoctorId ?? null,
        tipo: explicitSection ? "llenado_seccion" : "resumen_completo",
        estado: "ejecutando",
        seccionObjetivo: explicitSection,
        segmentoDesde: range.segmentoDesde,
        segmentoHasta: range.segmentoHasta,
        nombreModeloUsado: model,
        temperaturaUsada: temperature,
        versionPromptDoctorId: extractorAgent?.versionPromptDoctorId ?? null,
        entradaJson: {
          prompt,
          targetSections,
          trigger: job.data.trigger || "unknown",
          versionTranscripcionBase: versionTranscripcionBase || null,
        },
        inicioEjecucion: startedAt,
      })
      .returning({ id: agentExecutions.id });
    logger.info("[clinical-worker] execution:created", {
      consultaId,
      executionId: execution.id,
      agentId: extractorAgent?.agenteDoctorId ?? null,
      promptVersionId: extractorAgent?.versionPromptDoctorId ?? null,
      model,
      temperature,
      targetSections,
      segmentoDesde: range.segmentoDesde,
      segmentoHasta: range.segmentoHasta,
    });

    try {
      const response = await openai.chat.completions.create({
        model,
        temperature: numericTemperature,
        max_tokens: explicitSection ? 800 : 1800,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices[0]?.message?.content || "{}";
      const finishReason = response.choices[0]?.finish_reason || null;
      logger.info("[clinical-worker] openai:response", {
        consultaId,
        executionId: execution.id,
        responseChars: rawContent.length,
        finishReason,
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      });
      if (finishReason === "length") {
        throw new Error("Respuesta de OpenAI truncada por limite de salida");
      }

      let extractedData: Record<string, unknown>;
      try {
        extractedData = JSON.parse(rawContent) as Record<string, unknown>;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Respuesta JSON invalida de OpenAI: ${detail}`);
      }
      const phaseDetection = parseAnamnesisPhaseDetection(extractedData?._meta_anamnesis);
      let updatedSections = 0;
      logger.info("[clinical-worker] openai:parsed", {
        consultaId,
        executionId: execution.id,
        hasPhaseDetection: Boolean(phaseDetection),
      });

      if (phaseDetection) {
        await updateAnamnesisPhase(
          consultaId,
          consultation.estadoAnamnesis as AnamnesisPhaseStatus | null,
          phaseDetection,
          range.segmentoDesde,
          range.segmentoHasta
        );
      }

      for (const section of targetSections) {
        const extraction = parseExtractionValue(extractedData?.[section]);
        const nextValue = extraction.texto.trim();
        if (!nextValue) {
          logger.info("[clinical-worker] section:skip-empty", {
            consultaId,
            executionId: execution.id,
            section,
          });
          continue;
        }
        if (!extraction.evidenciaSegmentos?.length) {
          logger.info("[clinical-worker] section:skip-no-evidence", {
            consultaId,
            executionId: execution.id,
            section,
            confidence: extraction.confianza ?? null,
          });
          continue;
        }

        const previous = (existingMap.get(section) || "").trim();
        if (previous === nextValue) {
          logger.info("[clinical-worker] section:skip-unchanged", {
            consultaId,
            executionId: execution.id,
            section,
          });
          continue;
        }

        const evidencias = extraction.evidenciaSegmentos
          .map((sequence) => transcriptSlice.bySequence.get(sequence))
          .filter(Boolean)
          .map((segment) => ({
            segmentoTranscripcionId: segment.id,
            textoEvidencia: `[segmento ${segment.sequence}] ${segment.texto}`,
            confianza: extraction.confianza === null || extraction.confianza === undefined
              ? null
              : String(extraction.confianza),
          }));

        await scribeService.suggestSectionFromIa(record.id, section, nextValue, {
          confianza: extraction.confianza === null || extraction.confianza === undefined
            ? null
            : String(extraction.confianza),
          resumenSugeridoIa: extraction.resumen || null,
          origenDato: extraction.origenDato || null,
          ultimaEjecucionAgenteId: execution.id,
          evidencias,
        });
        logger.info("[clinical-worker] section:suggested", {
          consultaId,
          executionId: execution.id,
          fichaId: record.id,
          section,
          evidenceCount: evidencias.length,
          confidence: extraction.confianza ?? null,
          hasSummary: Boolean(extraction.resumen?.trim()),
        });
        updatedSections += 1;
      }

      if (updatedSections > 0) {
        await scribeService.refreshSuggestedRecordSummary(record.id);
        await scribeService.createRecordVersion(record.id, {
          origen: "ia",
          ejecucionAgenteId: execution.id,
          resumenCambios: `IA sugirio ${updatedSections} seccion(es) desde segmentos ${range.segmentoDesde}-${range.segmentoHasta}`,
        });
      }

      const finishedAt = new Date();
      const promptTokens = response.usage?.prompt_tokens ?? null;
      const completionTokens = response.usage?.completion_tokens ?? null;
      await db
        .update(agentExecutions)
        .set({
          estado: "exitosa",
          salidaJson: extractedData,
          salidaTexto: rawContent,
          tokensEntrada: promptTokens,
          tokensSalida: completionTokens,
          tokensTotal: response.usage?.total_tokens ?? null,
          costoEstimadoUsd: estimateGpt4oMiniCostUsd(promptTokens, completionTokens),
          finEjecucion: finishedAt,
          latenciaMs: finishedAt.getTime() - startedAt.getTime(),
        })
        .where(eq(agentExecutions.id, execution.id));

      logger.info(
        `Clinical extraction completed for ${consultaId} (segments ${range.segmentoDesde}-${range.segmentoHasta}, updatedSections=${updatedSections})`
      );
    } catch (error) {
      const finishedAt = new Date();
      await db
        .update(agentExecutions)
        .set({
          estado: "fallida",
          mensajeError: error instanceof Error ? error.message : String(error),
          finEjecucion: finishedAt,
          latenciaMs: finishedAt.getTime() - startedAt.getTime(),
        })
        .where(eq(agentExecutions.id, execution.id));
      logger.error(`Clinical extraction failed for ${consultaId}:`, error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: workerConcurrency,
  }
);

clinicalWorker.on("failed", (job, err) => {
  logger.error(`Job failed for ${job?.data?.consultaId || "unknown"}:`, err);
});

export { clinicalExtractionQueue };
