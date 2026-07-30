import { asc, eq, sql } from "drizzle-orm";
import { logger } from "../../core/utils/logger.js";
import { db } from "../../db/index.js";
import { consultations } from "../../db/schema/clinical.js";
import { transcriptionSegments } from "../../db/schema/scribe.js";

type Speaker = "doctor" | "paciente" | "familiar" | "desconocido";
type Origin = (typeof transcriptionSegments.$inferInsert)["origen"];

const inferSpeaker = (text: string): Speaker => {
  const value = text.trim().toLowerCase();
  if (/^(medico|m[e\u00e9]dico|doctor|dra\.?|dr\.?)\s*[:.-]/i.test(value)) return "doctor";
  if (/^(paciente|sr\.?|sra\.?|se[n\u00f1]or|se[n\u00f1]ora)\s*[:.-]/i.test(value)) return "paciente";
  if (/^(familiar|madre|padre|hijo|hija|esposa|esposo)\s*[:.-]/i.test(value)) return "familiar";
  if (
    value.includes("le voy a") ||
    value.includes("vamos a indicar") ||
    value.includes("le indico") ||
    value.includes("le recomiendo") ||
    value.includes("vamos a revisar") ||
    value.includes("le voy a examinar") ||
    value.includes("cuenteme") ||
    value.includes("cuénteme") ||
    value.includes("desde cuando") ||
    value.includes("desde cuándo") ||
    value.includes("tiene fiebre") ||
    value.includes("ha tenido") ||
    value.includes("ha tomado") ||
    value.includes("alguna alergia") ||
    value.includes("antecedentes") ||
    value.includes("voy a")
  ) {
    return "doctor";
  }
  if (
    value.includes("me duele") ||
    value.includes("me arde") ||
    value.includes("me siento") ||
    value.includes("siento") ||
    value.includes("tengo ") ||
    value.includes("he tenido") ||
    value.includes("yo ") ||
    value.includes("a mi ") ||
    value.includes("a mí ") ||
    value.includes("desde hace") ||
    value.includes("no puedo") ||
    value.includes("soy alerg") ||
    value.includes("estoy ")
  ) {
    return "paciente";
  }
  if (
    value.includes("mi mama") ||
    value.includes("mi mamá") ||
    value.includes("mi padre") ||
    value.includes("mi hijo") ||
    value.includes("mi hija") ||
    value.includes("lo trae") ||
    value.includes("la trae")
  ) {
    return "familiar";
  }
  return "desconocido";
};

const splitTranscript = (transcript: string, maxChars = 900) => {
  const normalized = transcript
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!normalized) return [];

  const sentenceParts = normalized
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const part of sentenceParts.length ? sentenceParts : [normalized]) {
    if (!current) {
      current = part;
      continue;
    }
    if (`${current} ${part}`.length <= maxChars) {
      current = `${current} ${part}`;
      continue;
    }
    chunks.push(current);
    current = part;
  }

  if (current) chunks.push(current);

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars * 1.5) return [chunk];
    const pieces: string[] = [];
    for (let i = 0; i < chunk.length; i += maxChars) {
      pieces.push(chunk.slice(i, i + maxChars).trim());
    }
    return pieces.filter(Boolean);
  });
};

export class TranscriptionSegmentService {
  async getPersistedTranscript(consultaId: string) {
    const rows = await db
      .select({ texto: transcriptionSegments.texto })
      .from(transcriptionSegments)
      .where(eq(transcriptionSegments.consultaId, consultaId))
      .orderBy(asc(transcriptionSegments.numeroSecuencia));

    return rows.map((row) => row.texto).filter(Boolean).join("\n").trim();
  }

  async getNextSequence(consultaId: string) {
    const rows = await db
      .select({
        maxSequence: sql<number>`coalesce(max(${transcriptionSegments.numeroSecuencia}), 0)`,
      })
      .from(transcriptionSegments)
      .where(eq(transcriptionSegments.consultaId, consultaId));

    return Number(rows[0]?.maxSequence || 0) + 1;
  }

  async getMaxSequence(consultaId: string) {
    const rows = await db
      .select({
        maxSequence: sql<number>`coalesce(max(${transcriptionSegments.numeroSecuencia}), 0)`,
      })
      .from(transcriptionSegments)
      .where(eq(transcriptionSegments.consultaId, consultaId));

    return Number(rows[0]?.maxSequence || 0);
  }

  async appendRealtimeSegment(params: {
    consultaId: string;
    sequence?: number;
    text: string;
    inicioMs?: number | null;
    finMs?: number | null;
    origin?: Origin;
  }) {
    const safeText = params.text.trim();
    if (!safeText) return null;

    const sequence = params.sequence ?? (await this.getNextSequence(params.consultaId));
    const speaker = inferSpeaker(safeText);

    const [segment] = await db
      .insert(transcriptionSegments)
      .values({
        consultaId: params.consultaId,
        numeroSecuencia: sequence,
        hablante: speaker,
        origen: params.origin ?? "flujo_en_vivo",
        inicioMs: params.inicioMs ?? null,
        finMs: params.finMs ?? null,
        texto: safeText,
        codigoIdioma: "es",
      })
      .returning();

    await db
      .update(consultations)
      .set({
        transcripcion: sql`trim(concat_ws(E'\n', coalesce(${consultations.transcripcion}, ''), ${safeText}))`,
        versionTranscripcion: sql`${consultations.versionTranscripcion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(consultations.id, params.consultaId));

    logger.info("[transcription-segment] realtime:stored", {
      consultaId: params.consultaId,
      segmentId: segment.id,
      sequence,
      textChars: safeText.length,
      speaker,
      origin: params.origin ?? "flujo_en_vivo",
    });

    return segment;
  }

  async ensureSegmentsFromTranscript(params: {
    consultaId: string;
    transcript: string;
    origin?: Origin;
    replaceConsultationTranscript?: boolean;
  }) {
    const transcript = params.transcript.trim();
    if (!transcript) {
      return { inserted: 0, skipped: true, maxSequence: await this.getMaxSequence(params.consultaId) };
    }

    const existingMaxSequence = await this.getMaxSequence(params.consultaId);
    if (existingMaxSequence > 0) {
      logger.info("[transcription-segment] batch:skip-existing", {
        consultaId: params.consultaId,
        existingMaxSequence,
        transcriptChars: transcript.length,
      });
      return { inserted: 0, skipped: true, maxSequence: existingMaxSequence };
    }

    const chunks = splitTranscript(transcript);
    if (!chunks.length) {
      return { inserted: 0, skipped: true, maxSequence: 0 };
    }

    const rows = chunks.map((text, index) => ({
      consultaId: params.consultaId,
      numeroSecuencia: index + 1,
      hablante: inferSpeaker(text),
      origen: params.origin ?? "archivo_subido",
      inicioMs: null,
      finMs: null,
      texto: text,
      codigoIdioma: "es",
    }));

    await db.insert(transcriptionSegments).values(rows);
    await db
      .update(consultations)
      .set({
        transcripcion: params.replaceConsultationTranscript === false
          ? sql`coalesce(${consultations.transcripcion}, ${transcript})`
          : transcript,
        versionTranscripcion: sql`${consultations.versionTranscripcion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(consultations.id, params.consultaId));

    logger.info("[transcription-segment] batch:stored", {
      consultaId: params.consultaId,
      inserted: rows.length,
      transcriptChars: transcript.length,
      origin: params.origin ?? "archivo_subido",
    });

    return { inserted: rows.length, skipped: false, maxSequence: rows.length };
  }
}

export const transcriptionSegmentService = new TranscriptionSegmentService();
