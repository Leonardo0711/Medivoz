import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Worker } from "bullmq";
import { OpenAI } from "openai";
import { env } from "../config/env.js";
import { redisConnection } from "../config/redis.js";
import { logger } from "../core/utils/logger.js";
import { db } from "../db/index.js";
import { consultations } from "../db/schema/clinical.js";
import { medicalRecordSections, transcriptionSegments } from "../db/schema/scribe.js";
import { audioTemporalService } from "../modules/scribe/audio-temporal.service.js";
import { scribeService } from "../modules/scribe/scribe.service.js";
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

const keywordMap: Array<{ section: SectionName; words: string[] }> = [
  { section: "motivo_consulta", words: ["motivo", "consulta", "queja", "principal", "dolor"] },
  { section: "tiempo_enfermedad", words: ["hace", "dias", "semanas", "meses", "desde"] },
  { section: "curso_enfermedad", words: ["empeora", "mejora", "progres", "evolucion", "curso"] },
  { section: "historia_cronologica", words: ["inicio", "luego", "despues", "primero", "cronolog"] },
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
    return ["motivo_consulta", "historia_cronologica", "sintomas_principales"];
  }

  return Array.from(found).slice(0, 5);
};

const parseSection = (raw: string | null | undefined): SectionName | null => {
  const value = String(raw || "").trim() as SectionName;
  return sectionNames.includes(value) ? value : null;
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
  if (!from || !to || to < from) return { text: "", maxSequence: 0 };

  const rows = await db
    .select({
      texto: transcriptionSegments.texto,
      sequence: transcriptionSegments.numeroSecuencia,
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

  const text = rows.map((row) => row.texto).filter(Boolean).join("\n");
  const maxSequence = rows[rows.length - 1]?.sequence || 0;
  return { text, maxSequence };
};

const buildPrompt = (
  sections: SectionName[],
  transcript: string,
  previousValues: Partial<Record<SectionName, string>>
) => {
  const sectionsList = sections.join(", ");
  const previousBlock = sections
    .map((section) => `${section}: ${previousValues[section] || ""}`)
    .join("\n");

  return `Devuelve SOLO un JSON valido con estas claves exactas: ${sectionsList}.
Si no hay evidencia nueva para una clave, devuelve "".
No repitas informacion sin evidencia reciente.

Contexto actual de secciones:
${previousBlock}

Nuevos segmentos de transcripcion:
${transcript}`;
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

    const range = await resolveSegmentRange(consultaId, segmentoDesde, segmentoHasta);
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

    const record = await scribeService.getOrCreateRecord(consultaId, {
      pacienteId: consultation.pacienteId,
      doctorId: consultation.doctorId,
    });

    const existingRows = await db
      .select({
        nombre: medicalRecordSections.nombre,
        textoActual: medicalRecordSections.textoActual,
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
      existingMap.set(row.nombre as SectionName, row.textoActual || "");
    }

    const prompt = buildPrompt(
      targetSections,
      compactTranscript,
      Object.fromEntries(existingMap.entries()) as Partial<Record<SectionName, string>>
    );

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 650,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const extractedData = JSON.parse(response.choices[0]?.message?.content || "{}");
      let updatedSections = 0;

      for (const section of targetSections) {
        const nextValue = String(extractedData?.[section] || "").trim();
        if (!nextValue) continue;

        const previous = (existingMap.get(section) || "").trim();
        if (previous === nextValue) continue;

        await scribeService.updateSection(record.id, section, nextValue, "ia");
        updatedSections += 1;
      }

      logger.info(
        `Clinical extraction completed for ${consultaId} (segments ${range.segmentoDesde}-${range.segmentoHasta}, updatedSections=${updatedSections})`
      );
    } catch (error) {
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
