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
  secciones: z.array(
    z.object({
      nombre: z.string(),
      contenido: z.string(),
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
  app.addHook("onRequest", app.authenticate);

  // POST /api/v1/scribe/save
  app.post(
    "/save",
    {
      schema: { body: convertSchema(saveRecordSchema) },
    },
    async (request, reply) => {
      const doctorId = (request.user as any).sub;
      const { consultaId, pacienteId, secciones } = request.body as any;

      try {
        const record = await scribeService.getOrCreateRecord(consultaId, {
          pacienteId,
          doctorId,
        });

        const results = [];
        for (const section of secciones) {
          const res = await scribeService.updateSection(
            record.id,
            section.nombre,
            section.contenido,
            "doctor",
            doctorId
          );
          results.push(res);
        }

        return { record, results };
      } catch (error: any) {
        return reply.code(400).send({ error: error.message });
      }
    }
  );

  // GET /api/v1/scribe/record/:consultaId
  app.get("/record/:consultaId", async (request, reply) => {
    const doctorId = (request.user as any).sub;
    const { consultaId } = request.params as any;
    try {
      const record = await scribeService.getRecordByConsultationForDoctor(consultaId, doctorId);
      if (!record) return reply.code(404).send({ error: "Ficha no encontrada" });
      return record;
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

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
        const payload = await transcribeWithAudioStaging({
          doctorId,
          consultaId: parsedConsultaId,
          buffer,
          mimeType,
          fileName: `consulta.${extFromMime(mimeType)}`,
        });
        return payload;
      } catch (error: any) {
        const message = String(error?.message || "");
        const statusCode = message.includes("25MB")
          ? 413
          : message.toLowerCase().includes("autorizada")
          ? 403
          : 400;
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

      const payload = await transcribeWithAudioStaging({
        doctorId,
        consultaId,
        buffer,
        mimeType,
        fileName,
      });
      return payload;
    } catch (error: any) {
      const message = String(error?.message || "");
      const statusCode = message.includes("25MB")
        ? 413
        : message.toLowerCase().includes("autorizada")
        ? 403
        : 400;
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
      const { transcription } = request.body as any;
      const compactTranscription = compactTranscriptionForExtraction(transcription);

      try {
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
        return {
          medicalRecord: normalizeMedicalRecord(raw),
          queue: autoFillSemaphore.getStats(),
          compactedChars: compactTranscription.length,
        };
      } catch (error: any) {
        return reply.code(400).send({ error: error.message || "Error al autocompletar ficha" });
      }
    }
  );
}
