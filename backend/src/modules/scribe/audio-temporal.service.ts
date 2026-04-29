import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, inArray, lt, eq } from "drizzle-orm";
import { env } from "../../config/env.js";
import { logger } from "../../core/utils/logger.js";
import { db } from "../../db/index.js";
import { temporalAudios } from "../../db/schema/clinical.js";

type CreateTempAudioInput = {
  consultaId: string;
  buffer: Buffer;
  mimeType?: string | null;
  originalFileName?: string | null;
  motivoConservacion?: string | null;
  ttlMinutes?: number;
};

type TempAudioRecord = {
  id: string;
  rutaArchivo: string;
  expiraEn: Date;
};

const allowedCleanupStates = [
  "pendiente_procesamiento",
  "disponible",
  "marcado_para_borrado",
  "error_eliminacion",
] as const;

const extFromMime = (mimeType?: string | null) => {
  const safe = String(mimeType || "").toLowerCase();
  if (safe.includes("wav")) return "wav";
  if (safe.includes("x-m4a") || safe.includes("m4a")) return "m4a";
  if (safe.includes("aac")) return "aac";
  if (safe.includes("mp4")) return "mp4";
  if (safe.includes("mpeg") || safe.includes("mp3")) return "mp3";
  if (safe.includes("ogg")) return "ogg";
  if (safe.includes("flac")) return "flac";
  if (safe.includes("webm")) return "webm";
  return "bin";
};

const sanitizeFileName = (raw?: string | null) => {
  const input = (raw || "").trim();
  if (!input) return "";
  return input.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
};

const futureDate = (minutes: number) => new Date(Date.now() + Math.max(1, minutes) * 60_000);

const parseDeleteRetryCount = (motivo?: string | null) => {
  const safe = String(motivo || "");
  const match = safe.match(/(?:retry_|max_retries_)(\d+)/i);
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
};

export class AudioTemporalService {
  private readonly baseDir = process.env.AUDIO_TEMP_DIR || env.AUDIO_TEMP_DIR;
  private readonly uploadTtlMinutes = env.AUDIO_TEMP_UPLOAD_TTL_MINUTES;
  private readonly errorTtlMinutes = env.AUDIO_TEMP_ERROR_TTL_MINUTES;
  private readonly maxDeleteRetries = Math.max(1, env.AUDIO_TEMP_DELETE_MAX_RETRIES || 3);

  async createTempAudio(input: CreateTempAudioInput): Promise<TempAudioRecord> {
    const ext = extFromMime(input.mimeType);
    const safeName = sanitizeFileName(input.originalFileName);
    const fileName = `${Date.now()}-${randomUUID()}${safeName ? `-${safeName}` : ""}.${ext}`;
    const dir = path.join(this.baseDir, input.consultaId);
    const fullPath = path.join(dir, fileName);

    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, input.buffer);

    const hash = createHash("sha256").update(input.buffer).digest("hex");
    const expiraEn = futureDate(input.ttlMinutes ?? this.uploadTtlMinutes);

    const [row] = await db
      .insert(temporalAudios)
      .values({
        consultaId: input.consultaId,
        rutaArchivo: fullPath,
        tipoMime: input.mimeType || null,
        tamanoBytes: input.buffer.length,
        hashArchivo: hash,
        estado: "pendiente_procesamiento",
        motivoConservacion: input.motivoConservacion || "upload_temporal",
        expiraEn,
      })
      .returning({
        id: temporalAudios.id,
        rutaArchivo: temporalAudios.rutaArchivo,
        expiraEn: temporalAudios.expiraEn,
      });

    return row;
  }

  async markAvailable(id: string) {
    await db
      .update(temporalAudios)
      .set({
        estado: "disponible",
      })
      .where(eq(temporalAudios.id, id));
  }

  async markForDeletion(id: string, motivoConservacion?: string) {
    await db
      .update(temporalAudios)
      .set({
        estado: "marcado_para_borrado",
        motivoConservacion: motivoConservacion || "cleanup_programado",
      })
      .where(eq(temporalAudios.id, id));
  }

  async markDeleted(id: string) {
    await db
      .update(temporalAudios)
      .set({
        estado: "eliminado",
        borradoEn: new Date(),
      })
      .where(eq(temporalAudios.id, id));
  }

  async markDeleteError(id: string, errorMessage?: string, retryCount = 1) {
    await db
      .update(temporalAudios)
      .set({
        estado: "error_eliminacion",
        motivoConservacion: `error_eliminacion:retry_${Math.max(1, retryCount)}:${(
          errorMessage || "unknown"
        ).slice(0, 160)}`,
        expiraEn: futureDate(this.errorTtlMinutes),
      })
      .where(eq(temporalAudios.id, id));
  }

  async markDeleteRetriesExhausted(id: string, retryCount: number, errorMessage?: string) {
    await db
      .update(temporalAudios)
      .set({
        estado: "error_eliminacion",
        motivoConservacion: `error_eliminacion:max_retries_${Math.max(1, retryCount)}:${(
          errorMessage || "unknown"
        ).slice(0, 150)}`,
        expiraEn: futureDate(24 * 60),
      })
      .where(eq(temporalAudios.id, id));
  }

  async markProcessingError(id: string, errorMessage?: string) {
    await db
      .update(temporalAudios)
      .set({
        estado: "disponible",
        motivoConservacion: `error_transcripcion:${(errorMessage || "unknown").slice(0, 180)}`,
        expiraEn: futureDate(this.errorTtlMinutes),
      })
      .where(eq(temporalAudios.id, id));
  }

  async deletePhysicalFile(rutaArchivo: string) {
    try {
      await unlink(rutaArchivo);
      return true;
    } catch (error: any) {
      if (error?.code === "ENOENT") return true;
      throw error;
    }
  }

  async deleteNow(id: string, rutaArchivo: string, motivo?: string) {
    await this.markForDeletion(id, motivo || "borrado_inmediato_post_transcripcion");
    try {
      await this.deletePhysicalFile(rutaArchivo);
      await this.markDeleted(id);
    } catch (error: any) {
      await this.markDeleteError(id, error?.message || "delete_failed");
      throw error;
    }
  }

  async cleanupExpiredAudios(batchSize = 100) {
    const now = new Date();
    const rows = await db
      .select({
        id: temporalAudios.id,
        rutaArchivo: temporalAudios.rutaArchivo,
        motivoConservacion: temporalAudios.motivoConservacion,
      })
      .from(temporalAudios)
      .where(
        and(
          lt(temporalAudios.expiraEn, now),
          inArray(temporalAudios.estado, [...allowedCleanupStates])
        )
      )
      .orderBy(asc(temporalAudios.expiraEn))
      .limit(Math.max(1, batchSize));

    let deleted = 0;
    let failed = 0;
    let exhausted = 0;

    for (const row of rows) {
      const currentRetries = parseDeleteRetryCount(row.motivoConservacion);
      if (currentRetries >= this.maxDeleteRetries) {
        exhausted += 1;
        logger.error("Audio temporal reached max delete retries:", {
          audioId: row.id,
          rutaArchivo: row.rutaArchivo,
          retries: currentRetries,
        });
        await this.markDeleteRetriesExhausted(row.id, currentRetries, "max_retries_reached");
        continue;
      }

      try {
        await this.markForDeletion(row.id, "expirado");
        await this.deletePhysicalFile(row.rutaArchivo);
        await this.markDeleted(row.id);
        deleted += 1;
      } catch (error: any) {
        failed += 1;
        const nextRetry = currentRetries + 1;
        if (nextRetry >= this.maxDeleteRetries) {
          exhausted += 1;
          await this.markDeleteRetriesExhausted(row.id, nextRetry, error?.message || "cleanup_failed");
        } else {
          await this.markDeleteError(row.id, error?.message || "cleanup_failed", nextRetry);
        }
        logger.error("Audio temporal cleanup failed:", {
          audioId: row.id,
          rutaArchivo: row.rutaArchivo,
          retries: nextRetry,
          error: error?.message || error,
        });
      }
    }

    return {
      scanned: rows.length,
      deleted,
      failed,
      exhausted,
    };
  }
}

export const audioTemporalService = new AudioTemporalService();
