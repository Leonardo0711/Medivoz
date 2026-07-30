import { FastifyInstance } from "fastify";
import { z } from "zod";
import { OpenAI } from "openai";
import { toFile } from "openai/uploads";
import { and, eq } from "drizzle-orm";
import { scribeService } from "./scribe.service.js";
import { convertSchema } from "../../core/utils/schema.js";
import { env } from "../../config/env.js";
import { AsyncSemaphore } from "../../core/utils/async-semaphore.js";
import { db } from "../../db/index.js";
import { consultations } from "../../db/schema/clinical.js";
import { audioTemporalService } from "./audio-temporal.service.js";
import { transcriptionSegmentService } from "./transcription-segment.service.js";
import { enqueueClinicalExtraction } from "../../worker/clinical.queue.js";
import { logger } from "../../core/utils/logger.js";
import { requireClinicalAccess } from "../../core/auth/roles.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const transcriptionConcurrency = Math.max(
  1,
  Number.parseInt(process.env.TRANSCRIPTION_MAX_CONCURRENCY ?? "6", 10) || 6
);
const autoFillConcurrency = Math.max(
  1,
  Number.parseInt(process.env.AUTOFILL_MAX_CONCURRENCY ?? "8", 10) || 8
);

const transcriptionSemaphore = new AsyncSemaphore(transcriptionConcurrency);
const autoFillSemaphore = new AsyncSemaphore(autoFillConcurrency);
const maxAudioBytes = 25 * 1024 * 1024;

const saveRecordSchema = z.object({
  consultaId: z.string().uuid(),
  pacienteId: z.string().uuid().optional(),
  resumenSugeridoIa: z.string().nullable().optional(),
  resumenActual: z.string().nullable().optional(),
  sesionEdicionId: z.string().uuid().nullable().optional(),
  duracionEdicionTotalMs: z.number().int().nonnegative().nullable().optional(),
  secciones: z.array(
    z.object({
      nombre: z.string(),
      contenido: z.string(),
      textoSugeridoIa: z.string().nullable().optional(),
      resumenSugeridoIa: z.string().nullable().optional(),
      resumenActual: z.string().nullable().optional(),
      duracionEdicionMs: z.number().int().nonnegative().nullable().optional(),
      confianza: z.string().nullable().optional(),
      origenDato: z.string().nullable().optional(),
    })
  ),
});

const transcribeSchema = z.object({
  audio: z.string().min(1),
  mimeType: z.string().optional(),
  consultaId: z.string().uuid().optional(),
});

const autoFillSchema = z.object({
  transcription: z.string().min(20),
  consultaId: z.string().uuid().optional(),
});

const reviewSectionSchema = z.object({
  action: z.enum(["accept", "reject", "block"]),
  contenido: z.string().optional().nullable(),
  resumenActual: z.string().optional().nullable(),
  duracionEdicionMs: z.number().int().nonnegative().optional().nullable(),
  sesionEdicionId: z.string().uuid().optional().nullable(),
});

const syncEditSessionSchema = z.object({
  duracionActivaMs: z.number().int().nonnegative(),
  estado: z.enum(["activa", "pausada", "completada"]).optional(),
});

const queueExtractionSchema = z.object({
  seccion: z.string().optional().nullable(),
});

const refineSectionSchema = z.object({
  action: z
    .enum(["resumir", "expandir", "corregir_estilo", "extraer_negativos", "formato_institucional"])
    .default("corregir_estilo"),
});

const normalizeMedicalRecord = (raw: Record<string, unknown>) => ({
  motivo_consulta: String(raw.motivo_consulta || ""),
  tiempo_enfermedad: String(raw.tiempo_enfermedad || ""),
  forma_inicio: String(raw.forma_inicio || ""),
  curso_enfermedad: String(raw.curso_enfermedad || ""),
  historia_cronologica: String(raw.historia_cronologica || ""),
  antecedentes: String(raw.antecedentes || ""),
  sintomas_principales: String(raw.sintomas_principales || ""),
  estado_funcional_basal: String(raw.estado_funcional_basal || ""),
  estudios_previos: String(raw.estudios_previos || ""),
  notas_adicionales: String(raw.notas_adicionales || ""),
});

const extFromMime = (mimeType?: string) => {
  if (!mimeType) return "webm";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("x-m4a") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("flac")) return "flac";
  return "webm";
};

const compactTranscriptionForExtraction = (transcription: string) => {
  const lines = transcription
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const compactLines: string[] = [];
  let prev = "";
  for (const line of lines) {
    if (line !== prev) compactLines.push(line);
    prev = line;
  }

  const compact = compactLines.join("\n").replace(/\n{3,}/g, "\n\n");
  const maxChars = 18000;
  if (compact.length <= maxChars) return compact;

  const head = compact.slice(0, 11000);
  const tail = compact.slice(-6500);
  return `${head}\n[...CONTENIDO RECORTADO POR LONGITUD...]\n${tail}`;
};

const transcribeAudioBuffer = async (buffer: Buffer, mimeType?: string, fileName?: string) => {
  if (buffer.length === 0) {
    throw new Error("No se recibio contenido de audio");
  }
  if (buffer.length > maxAudioBytes) {
    throw new Error("El archivo excede 25MB y no puede ser transcrito");
  }

  return transcriptionSemaphore.withPermit(async () => {
    const effectiveMime = mimeType || "audio/webm";
    const ext = extFromMime(effectiveMime);
    const safeFilename = fileName?.trim() || `consulta.${ext}`;
    const file = await toFile(buffer, safeFilename, { type: effectiveMime });

    let text = "";
    try {
      const result = await openai.audio.transcriptions.create({
        model: "gpt-4o-mini-transcribe",
        file,
        language: "es",
      });
      text = result.text || "";
    } catch {
      const result = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file,
        language: "es",
      });
      text = result.text || "";
    }

    return {
      formattedTranscription: text,
      rawTranscription: { text },
      queue: transcriptionSemaphore.getStats(),
    };
  });
};

const parseConsultaId = (value: unknown) => {
  if (typeof value !== "string") return null;
  const parsed = z.string().uuid().safeParse(value.trim());
  return parsed.success ? parsed.data : null;
};

const getDoctorConsultation = async (consultaId: string, doctorId: string) => {
  return db.query.consultations.findFirst({
    where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
    columns: {
      id: true,
    },
  });
};

const transcribeWithAudioStaging = async (params: {
  doctorId: string;
  consultaId: string | null;
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
}) => {
  if (!params.consultaId) {
    return transcribeAudioBuffer(params.buffer, params.mimeType, params.fileName);
  }

  const consultation = await getDoctorConsultation(params.consultaId, params.doctorId);
  if (!consultation) {
    throw new Error("Consulta no autorizada para transcripcion de audio");
  }

  const tempAudio = await audioTemporalService.createTempAudio({
    consultaId: params.consultaId,
    buffer: params.buffer,
    mimeType: params.mimeType,
    originalFileName: params.fileName,
    motivoConservacion: "upload_temporal_transcripcion",
  });

  await audioTemporalService.markAvailable(tempAudio.id);

  try {
    const payload = await transcribeAudioBuffer(params.buffer, params.mimeType, params.fileName);
    if (payload.formattedTranscription?.trim()) {
      await transcriptionSegmentService.ensureSegmentsFromTranscript({
        consultaId: params.consultaId,
        transcript: payload.formattedTranscription,
        origin: params.fileName ? "archivo_subido" : "fusion_sistema",
      });
    }
    await audioTemporalService.deleteNow(tempAudio.id, tempAudio.rutaArchivo, "procesado_ok_borrado_inmediato");
    return {
      ...payload,
      audioTemporal: {
        id: tempAudio.id,
        staged: true,
        deletedImmediately: true,
      },
    };
  } catch (error: any) {
    await audioTemporalService.markProcessingError(tempAudio.id, error?.message || "transcription_failed");
    throw error;
  }
};

export async function scribeRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    return requireClinicalAccess(request, reply);
  });

  // POST /api/v1/scribe/save
  app.post(
    "/save",
    {
      schema: { body: convertSchema(saveRecordSchema) },
    },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const {
        consultaId,
        pacienteId,
        secciones,
        resumenSugeridoIa,
        resumenActual,
        sesionEdicionId,
        duracionEdicionTotalMs,
      } = request.body as any;

      try {
        logger.info("[scribe-route] save:start", {
          doctorId,
          consultaId,
          pacienteId: pacienteId || null,
          sectionCount: secciones.length,
          sections: secciones.map((section: any) => section.nombre),
          hasRecordSummary: Boolean(resumenActual?.trim?.() || resumenSugeridoIa?.trim?.()),
        });
        const { record, results } = await scribeService.saveRecord({
          consultaId,
          pacienteId,
          doctorId,
          secciones,
          resumenSugeridoIa,
          resumenActual,
          sesionEdicionId,
          duracionEdicionTotalMs,
        });

        logger.info("[scribe-route] save:done", {
          doctorId,
          consultaId,
          fichaId: record.id,
          updatedSections: results.length,
          hasRecordSummary: Boolean(resumenActual?.trim?.() || resumenSugeridoIa?.trim?.()),
        });
        return { record, results };
      } catch (error: any) {
        logger.error("[scribe-route] save:failed", {
          doctorId,
          consultaId,
          message: error?.message || "unknown",
        });
        return reply.code(400).send({ error: error.message });
      }
    }
  );

  // GET /api/v1/scribe/record/:consultaId
  app.get("/record/:consultaId", async (request, reply) => {
    const doctorId = (request.user as any).sub;
    const { consultaId } = request.params as any;
    try {
      logger.info("[scribe-route] record:get", { doctorId, consultaId });
      const record = await scribeService.getRecordByConsultationForDoctor(consultaId, doctorId);
      if (!record) return reply.code(404).send({ error: "Ficha no encontrada" });
      return record;
    } catch (error: any) {
      logger.error("[scribe-route] record:get:failed", {
        doctorId,
        consultaId,
        message: error?.message || "unknown",
      });
      return reply.code(400).send({ error: error.message });
    }
  });

  app.get("/record/:consultaId/validation", async (request, reply) => {
    const doctorId = (request.user as any).sub;
    const { consultaId } = request.params as any;
    try {
      logger.info("[scribe-route] validation:get", { doctorId, consultaId });
      const result = await scribeService.validateRecord(consultaId, doctorId);
      if (!result) return reply.code(404).send({ error: "Consulta no encontrada" });
      return result;
    } catch (error: any) {
      logger.error("[scribe-route] validation:failed", {
        doctorId,
        consultaId,
        message: error?.message || "unknown",
      });
      return reply.code(400).send({ error: "No se pudo validar la ficha" });
    }
  });

  app.post("/record/:consultaId/edit-sessions/start", async (request, reply) => {
    const doctorId = (request.user as any).sub;
    const { consultaId } = request.params as any;
    try {
      const session = await scribeService.startEditSession(consultaId, doctorId);
      if (!session) return reply.code(404).send({ error: "Consulta no encontrada" });
      return session;
    } catch (error: any) {
      logger.error("[scribe-route] edit-session:start:failed", {
        doctorId,
        consultaId,
        message: error?.message || "unknown",
      });
      return reply.code(400).send({ error: "No se pudo iniciar la medicion de edicion" });
    }
  });

  app.patch(
    "/record/:consultaId/edit-sessions/:editSessionId",
    { schema: { body: convertSchema(syncEditSessionSchema) } },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { consultaId, editSessionId } = request.params as any;
      const input = request.body as any;
      try {
        const session = await scribeService.syncEditSession(consultaId, doctorId, editSessionId, input);
        if (!session) return reply.code(404).send({ error: "Sesion de edicion no encontrada" });
        return session;
      } catch (error: any) {
        logger.error("[scribe-route] edit-session:sync:failed", {
          doctorId,
          consultaId,
          editSessionId,
          message: error?.message || "unknown",
        });
        return reply.code(400).send({ error: "No se pudo guardar el tiempo de edicion" });
      }
    }
  );

  app.get("/record/:consultaId/edit-metrics", async (request, reply) => {
    const doctorId = (request.user as any).sub;
    const { consultaId } = request.params as any;
    const metrics = await scribeService.getEditMetrics(consultaId, doctorId);
    if (!metrics) return reply.code(404).send({ error: "Consulta no encontrada" });
    return metrics;
  });

  app.post(
    "/record/:consultaId/sections/:nombre/review",
    {
      schema: { body: convertSchema(reviewSectionSchema) },
    },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { consultaId, nombre } = request.params as any;
      const { action, contenido, resumenActual, duracionEdicionMs, sesionEdicionId } = request.body as any;

      try {
        logger.info("[scribe-route] section:review:start", {
          doctorId,
          consultaId,
          section: nombre,
          action,
          hasContentPayload: Boolean(contenido?.trim?.()),
          hasSummaryPayload: Boolean(resumenActual?.trim?.()),
        });
        const updated = await scribeService.reviewSection(consultaId, doctorId, nombre, action, {
          contenido,
          resumenActual,
          duracionEdicionMs,
          sesionEdicionId,
        });
        if (!updated) {
          logger.warn("[scribe-route] section:review:not-found", {
            doctorId,
            consultaId,
            section: nombre,
            action,
          });
          return reply.code(404).send({ error: "Seccion no encontrada o consulta no autorizada" });
        }
        logger.info("[scribe-route] section:review:done", {
          doctorId,
          consultaId,
          section: nombre,
          action,
          sectionId: updated.id,
          nextEstado: updated.estado,
        });
        return updated;
      } catch (error: any) {
        logger.error("[scribe-route] section:review:failed", {
          doctorId,
          consultaId,
          section: nombre,
          action,
          message: error?.message || "unknown",
        });
        return reply.code(400).send({ error: error.message || "No se pudo actualizar la seccion" });
      }
    }
  );

  app.post(
    "/record/:consultaId/queue-extraction",
    {
      schema: { body: convertSchema(queueExtractionSchema) },
    },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { consultaId } = request.params as any;
      const { seccion } = request.body as any;

      try {
        logger.info("[scribe-route] queue-extraction:start", {
          doctorId,
          consultaId,
          section: seccion || null,
        });
        const consultation = await getDoctorConsultation(consultaId, doctorId);
        if (!consultation) {
          logger.warn("[scribe-route] queue-extraction:not-authorized", { doctorId, consultaId });
          return reply.code(403).send({ error: "Consulta no autorizada para procesamiento IA" });
        }

        const queued = await enqueueClinicalExtraction({
          consultaId,
          seccionObjetivo: seccion || null,
          trigger: "manual_frontend",
        });

        logger.info("[scribe-route] queue-extraction:done", {
          doctorId,
          consultaId,
          section: seccion || null,
          jobId: queued.jobId,
          queued: queued.queued,
          coalesced: queued.coalesced,
          state: queued.state,
        });
        return {
          queued: true,
          job: queued,
          message: "Procesamiento IA en cola. La ficha se actualizara por secciones.",
        };
      } catch (error: any) {
        logger.error("[scribe-route] queue-extraction:failed", {
          doctorId,
          consultaId,
          section: seccion || null,
          message: error?.message || "unknown",
        });
        return reply.code(400).send({ error: "No se pudo encolar el procesamiento IA" });
      }
    }
  );

  app.post(
    "/record/:consultaId/sections/:nombre/retry",
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { consultaId, nombre } = request.params as any;

      try {
        logger.info("[scribe-route] section:retry:start", {
          doctorId,
          consultaId,
          section: nombre,
        });
        const consultation = await getDoctorConsultation(consultaId, doctorId);
        if (!consultation) {
          logger.warn("[scribe-route] section:retry:not-authorized", { doctorId, consultaId, section: nombre });
          return reply.code(403).send({ error: "Consulta no autorizada para reintentar IA" });
        }

        const queued = await enqueueClinicalExtraction({
          consultaId,
          seccionObjetivo: nombre || null,
          trigger: "manual_frontend",
        });

        logger.info("[scribe-route] section:retry:queued", {
          doctorId,
          consultaId,
          section: nombre,
          jobId: queued.jobId,
          queued: queued.queued,
          coalesced: queued.coalesced,
          state: queued.state,
        });
        return {
          queued: true,
          job: queued,
          message: "Se reintento la extraccion IA de esta seccion.",
        };
      } catch (error: any) {
        logger.error("[scribe-route] section:retry:failed", {
          doctorId,
          consultaId,
          section: nombre,
          message: error?.message || "unknown",
        });
        return reply.code(400).send({ error: "No se pudo reintentar esta seccion" });
      }
    }
  );

  app.post(
    "/record/:consultaId/sections/:nombre/refine",
    {
      schema: { body: convertSchema(refineSectionSchema) },
    },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { consultaId, nombre } = request.params as any;
      const { action } = request.body as any;

      try {
        logger.info("[scribe-route] section:refine:start", {
          doctorId,
          consultaId,
          section: nombre,
          action,
        });

        const record = await scribeService.getRecordByConsultationForDoctor(consultaId, doctorId);
        if (!record) return reply.code(404).send({ error: "Ficha no encontrada" });

        const section = (record.sections || []).find((item: any) => item.nombre === nombre);
        const sourceText = String(section?.textoActual || section?.textoSugeridoIa || "").trim();
        if (!sourceText) {
          return reply.code(400).send({ error: "La seccion no tiene texto para mejorar" });
        }

        const instructions: Record<string, string> = {
          resumir: "Resume en una frase clinica corta sin perder datos relevantes.",
          expandir: "Redacta con un poco mas de contexto clinico, sin inventar datos.",
          corregir_estilo: "Corrige redaccion y estilo clinico manteniendo exactamente los datos.",
          extraer_negativos: "Extrae solo negativos clinicos relevantes que esten explicitamente mencionados.",
          formato_institucional: "Convierte a un parrafo breve para copiar en una plataforma institucional.",
        };

        const prompt = `Devuelve SOLO JSON valido con la clave "texto".
Tarea: ${instructions[action] || instructions.corregir_estilo}
Reglas:
- No inventes datos.
- No agregues diagnosticos.
- Mantén negaciones y temporalidad.
- Si el texto no contiene dato suficiente, devuelve el mismo texto corregido.

Texto de la seccion:
${sourceText}`;

        const completion = await autoFillSemaphore.withPermit(() =>
          openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0,
            max_tokens: 450,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          })
        );

        const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
        const suggestion = String(parsed.texto || "").trim();

        logger.info("[scribe-route] section:refine:done", {
          doctorId,
          consultaId,
          section: nombre,
          action,
          suggestionChars: suggestion.length,
        });

        return { suggestion, action };
      } catch (error: any) {
        logger.error("[scribe-route] section:refine:failed", {
          doctorId,
          consultaId,
          section: nombre,
          action,
          message: error?.message || "unknown",
        });
        return reply.code(400).send({ error: "No se pudo mejorar esta seccion" });
      }
    }
  );

  // POST /api/v1/scribe/transcribe-audio (legacy base64)
  app.post(
    "/transcribe-audio",
    {
      schema: { body: convertSchema(transcribeSchema) },
    },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { audio, mimeType, consultaId } = request.body as any;
      try {
        const buffer = Buffer.from(audio, "base64");
        const parsedConsultaId =
          parseConsultaId(consultaId) || parseConsultaId(request.headers["x-consulta-id"]);
        logger.info("[scribe-route] transcribe-base64:start", {
          doctorId,
          consultaId: parsedConsultaId,
          mimeType: mimeType || null,
          bytes: buffer.length,
        });
        const payload = await transcribeWithAudioStaging({
          doctorId,
          consultaId: parsedConsultaId,
          buffer,
          mimeType,
          fileName: `consulta.${extFromMime(mimeType)}`,
        });
        logger.info("[scribe-route] transcribe-base64:done", {
          doctorId,
          consultaId: parsedConsultaId,
          bytes: buffer.length,
          textChars: payload.formattedTranscription?.length || 0,
        });
        return payload;
      } catch (error: any) {
        const message = String(error?.message || "");
        const statusCode = message.includes("25MB")
          ? 413
          : message.toLowerCase().includes("autorizada")
          ? 403
          : 400;
        logger.error("[scribe-route] transcribe-base64:failed", {
          doctorId,
          consultaId: parseConsultaId(consultaId) || null,
          statusCode,
          message: error?.message || "unknown",
        });
        return reply.code(statusCode).send({ error: error.message || "Error al transcribir audio" });
      }
    }
  );

  // POST /api/v1/scribe/transcribe-audio-binary (recommended)
  app.post("/transcribe-audio-binary", async (request, reply) => {
    const doctorId = (request.user as any).sub;
    try {
      const rawBody = request.body as unknown;
      const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.alloc(0);
      const headerMime = String(request.headers["x-audio-mime"] || "").trim();
      const contentType = String(request.headers["content-type"] || "").split(";")[0].trim();
      const mimeType = (headerMime || contentType || "audio/webm").toLowerCase();
      const filenameHeader = request.headers["x-audio-filename"];
      const fileName = typeof filenameHeader === "string" ? filenameHeader : undefined;
      const consultaId = parseConsultaId(request.headers["x-consulta-id"]);

      logger.info("[scribe-route] transcribe-binary:start", {
        doctorId,
        consultaId,
        mimeType,
        bytes: buffer.length,
      });
      const payload = await transcribeWithAudioStaging({
        doctorId,
        consultaId,
        buffer,
        mimeType,
        fileName,
      });
      logger.info("[scribe-route] transcribe-binary:done", {
        doctorId,
        consultaId,
        bytes: buffer.length,
        textChars: payload.formattedTranscription?.length || 0,
      });
      return payload;
    } catch (error: any) {
      const message = String(error?.message || "");
      const statusCode = message.includes("25MB")
        ? 413
        : message.toLowerCase().includes("autorizada")
        ? 403
        : 400;
      logger.error("[scribe-route] transcribe-binary:failed", {
        doctorId,
        statusCode,
        message: error?.message || "unknown",
      });
      return reply.code(statusCode).send({ error: error.message || "Error al transcribir audio" });
    }
  });

  // POST /api/v1/scribe/auto-fill
  app.post(
    "/auto-fill",
    {
      schema: { body: convertSchema(autoFillSchema) },
    },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { transcription, consultaId } = request.body as any;
      const compactTranscription = compactTranscriptionForExtraction(transcription);

      try {
        logger.info("[scribe-route] auto-fill:start", {
          doctorId,
          consultaId: consultaId || null,
          transcriptChars: transcription.length,
          compactedChars: compactTranscription.length,
        });
        let record: any = null;
        if (consultaId) {
          const consultation = await getDoctorConsultation(consultaId, doctorId);
          if (!consultation) {
            logger.warn("[scribe-route] auto-fill:not-authorized", { doctorId, consultaId });
            return reply.code(403).send({ error: "Consulta no autorizada para autocompletar ficha" });
          }
          record = await scribeService.getOrCreateRecord(consultaId, { doctorId });
          const segmentResult = await transcriptionSegmentService.ensureSegmentsFromTranscript({
            consultaId,
            transcript: compactTranscription,
            origin: "fusion_sistema",
            replaceConsultationTranscript: false,
          });
          const queued = await enqueueClinicalExtraction({
            consultaId,
            trigger: "manual_frontend",
            segmentoHasta: segmentResult.maxSequence || undefined,
          });
          logger.info("[scribe-route] auto-fill:queued", {
            doctorId,
            consultaId,
            fichaId: record.id,
            jobId: queued.jobId,
            queued: queued.queued,
            coalesced: queued.coalesced,
            state: queued.state,
            segmentInserted: segmentResult.inserted,
            maxSequence: segmentResult.maxSequence,
          });
          return {
            queued: true,
            job: queued,
            message: "Procesamiento IA en cola. La ficha se actualizara por secciones.",
          };
        }

        const prompt = `Devuelve SOLO un JSON valido con estas claves exactas:
motivo_consulta, tiempo_enfermedad, forma_inicio, curso_enfermedad, historia_cronologica, antecedentes, sintomas_principales, estado_funcional_basal, estudios_previos, notas_adicionales.
Si no hay dato para una clave, devuelve "".

Transcripcion clinica:
${compactTranscription}`;

        const completion = await autoFillSemaphore.withPermit(() =>
          openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0,
            max_tokens: 900,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          })
        );

        const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
        const medicalRecord = normalizeMedicalRecord(raw);
        const filledSections = Object.values(medicalRecord).filter((value) => String(value || "").trim()).length;

        if (record) {
          for (const [section, value] of Object.entries(medicalRecord)) {
            const suggestion = String(value || "").trim();
            if (!suggestion) continue;
            await scribeService.suggestSectionFromIa(record.id, section, suggestion, {
              confianza: null,
              evidencias: [
                {
                  textoEvidencia: compactTranscription.slice(0, 1200),
                  confianza: null,
                },
              ],
            });
          }
        }

        logger.info("[scribe-route] auto-fill:legacy-done", {
          doctorId,
          consultaId: consultaId || null,
          filledSections,
          compactedChars: compactTranscription.length,
          queue: autoFillSemaphore.getStats(),
        });
        return {
          medicalRecord,
          queue: autoFillSemaphore.getStats(),
          compactedChars: compactTranscription.length,
        };
      } catch (error: any) {
        logger.error("[scribe-route] auto-fill:failed", {
          doctorId,
          consultaId: consultaId || null,
          message: error?.message || "unknown",
        });
        return reply.code(400).send({ error: error.message || "Error al autocompletar ficha" });
      }
    }
  );
}
