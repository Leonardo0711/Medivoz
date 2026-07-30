import { and, eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { Server, Socket } from "socket.io";
import { logger } from "../core/utils/logger.js";
import { db } from "../db/index.js";
import { consultations } from "../db/schema/clinical.js";
import { env } from "../config/env.js";
import { OpenAIRealtimeService } from "../modules/scribe/openai-realtime.service.js";
import { transcriptionSegmentService } from "../modules/scribe/transcription-segment.service.js";
import { enqueueClinicalExtraction } from "../worker/clinical.queue.js";

type SocketUser = {
  sub: string;
  email?: string;
  rol?: string;
};

type RuntimeSession = {
  service: OpenAIRealtimeService;
  nextSequence: number;
  persistChain: Promise<void>;
  idleTimer: NodeJS.Timeout | null;
  createdAt: number;
  lastSegmentEndMs: number;
  lastAudioEndMs: number;
  bufferedCharsSinceQueue: number;
  lastQueuedSequence: number;
  lastQueueAt: number;
  audioChunksReceived: number;
};

type JoinPayload = string | { consultaId: string };

type AudioChunkPayload = {
  consultaId: string;
  chunk: string | Buffer | ArrayBuffer | number[];
  startMs?: number;
  endMs?: number;
  encoding?: "pcm16";
  sampleRate?: number;
};

type StopPayload = {
  consultaId: string;
};

const runtimeSessions = new Map<string, RuntimeSession>();
const pendingRuntimeSessions = new Map<string, Promise<RuntimeSession>>();
const realtimeFailureNotifiedAt = new Map<string, number>();
const IDLE_SESSION_TTL_MS = Math.max(
  30_000,
  Number.parseInt(process.env.REALTIME_IDLE_SESSION_TTL_MS ?? "300000", 10) || 300000
);
const EXTRACTION_MIN_CHARS = Math.max(
  300,
  Number.parseInt(process.env.REALTIME_EXTRACTION_MIN_CHARS ?? "900", 10) || 900
);
const EXTRACTION_MIN_SEGMENTS = Math.max(
  2,
  Number.parseInt(process.env.REALTIME_EXTRACTION_MIN_SEGMENTS ?? "4", 10) || 4
);
const EXTRACTION_MIN_INTERVAL_MS = Math.max(
  5_000,
  Number.parseInt(process.env.REALTIME_EXTRACTION_MIN_INTERVAL_MS ?? "15000", 10) || 15000
);

const extractToken = (socket: Socket): string | null => {
  const authToken = (socket.handshake.auth as any)?.token;
  const queryToken = typeof socket.handshake.query?.token === "string" ? socket.handshake.query.token : null;
  const headerAuth =
    typeof socket.handshake.headers?.authorization === "string"
      ? socket.handshake.headers.authorization
      : null;

  const raw = authToken || queryToken || headerAuth;
  if (!raw) return null;
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim();
};

const getDoctorConsultation = async (consultaId: string, doctorId: string) => {
  return db.query.consultations.findFirst({
    where: and(eq(consultations.id, consultaId), eq(consultations.doctorId, doctorId)),
  });
};

const fetchPersistedTranscript = async (consultaId: string) => {
  return transcriptionSegmentService.getPersistedTranscript(consultaId);
};

const fetchNextSequence = async (consultaId: string) => {
  return transcriptionSegmentService.getNextSequence(consultaId);
};

const fetchMaxSequence = async (consultaId: string) => {
  return transcriptionSegmentService.getMaxSequence(consultaId);
};

const inferSpeaker = (text: string): "doctor" | "paciente" | "familiar" | "desconocido" => {
  const value = text.trim().toLowerCase();
  if (/^(medico|m[eé]dico|doctor|dra\.?|dr\.?)\s*[:.-]/i.test(value)) return "doctor";
  if (/^(paciente|sr\.?|sra\.?|se[nñ]or|se[nñ]ora)\s*[:.-]/i.test(value)) return "paciente";
  if (/^(familiar|madre|padre|hijo|hija|esposa|esposo)\s*[:.-]/i.test(value)) return "familiar";
  if (value.includes("le voy a") || value.includes("vamos a indicar") || value.includes("le indico")) return "doctor";
  if (value.includes("me duele") || value.includes("siento") || value.includes("tengo ")) return "paciente";
  return "desconocido";
};

const persistSegment = async (
  consultaId: string,
  sequence: number,
  text: string,
  timing?: { inicioMs?: number | null; finMs?: number | null }
) => {
  await transcriptionSegmentService.appendRealtimeSegment({
    consultaId,
    sequence,
    text,
    inicioMs: timing?.inicioMs ?? null,
    finMs: timing?.finMs ?? null,
  });
};

const queueIncrementalExtraction = async (
  consultaId: string,
  segmentoHasta: number,
  trigger: string
) => {
  const consultation = await db.query.consultations.findFirst({
    columns: {
      versionTranscripcion: true,
    },
    where: eq(consultations.id, consultaId),
  });

  const versionBase = Number(consultation?.versionTranscripcion || 0);
  const segmentoDesde = Math.max(1, segmentoHasta - 24);

  const enqueueResult = await enqueueClinicalExtraction({
    consultaId,
    segmentoDesde,
    segmentoHasta,
    versionTranscripcionBase: versionBase,
    trigger,
  });

  logger.info("[socket] incremental-extraction:queued", {
    consultaId,
    segmentoDesde,
    segmentoHasta,
    trigger,
    enqueueResult,
  });
};

const normalizeAudioChunk = (chunk: AudioChunkPayload["chunk"]) => {
  if (!chunk) return null;
  if (typeof chunk === "string") return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString("base64");
  if (chunk instanceof ArrayBuffer) return Buffer.from(chunk).toString("base64");
  if (Array.isArray(chunk)) return Buffer.from(chunk).toString("base64");
  return null;
};

export function setupSockets(app: FastifyInstance) {
  const io = new Server(app.server, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error("UNAUTHORIZED"));

      const decoded = await app.jwt.verify<SocketUser>(token);
      (socket.data as any).user = decoded;
      next();
    } catch (error) {
      next(new Error("UNAUTHORIZED"));
    }
  });

  const clearIdleTimer = (consultaId: string) => {
    const session = runtimeSessions.get(consultaId);
    if (session?.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
  };

  const scheduleIdleCleanup = (consultaId: string) => {
    const session = runtimeSessions.get(consultaId);
    if (!session) return;

    clearIdleTimer(consultaId);
    session.idleTimer = setTimeout(async () => {
      const listeners = io.sockets.adapter.rooms.get(consultaId)?.size ?? 0;
      if (listeners > 0) return;

      try {
        await session.persistChain.catch(() => {});
        session.service.disconnect();
      } finally {
        runtimeSessions.delete(consultaId);
        logger.info(`Realtime session cleaned up after idle timeout: ${consultaId}`);
      }
    }, IDLE_SESSION_TTL_MS);
  };

  const ensureRealtimeSession = async (consultaId: string) => {
    const existing = runtimeSessions.get(consultaId);
    if (existing) {
      clearIdleTimer(consultaId);
      logger.info("[socket] realtime-session:reuse", {
        consultaId,
        nextSequence: existing.nextSequence,
        audioChunksReceived: existing.audioChunksReceived,
      });
      return existing;
    }

    const pending = pendingRuntimeSessions.get(consultaId);
    if (pending) {
      logger.info("[socket] realtime-session:await-pending", { consultaId });
      return pending;
    }

    const connection = (async () => {
      const nextSequence = await fetchNextSequence(consultaId);
      const runtime: RuntimeSession = {
        service: null as unknown as OpenAIRealtimeService,
        nextSequence,
        persistChain: Promise.resolve(),
        idleTimer: null,
        createdAt: Date.now(),
        bufferedCharsSinceQueue: 0,
        lastQueuedSequence: Math.max(0, nextSequence - 1),
        lastQueueAt: 0,
        lastSegmentEndMs: 0,
        lastAudioEndMs: 0,
        audioChunksReceived: 0,
      };

      const aiService = new OpenAIRealtimeService(
        (delta) => {
          io.to(consultaId).emit("transcription_delta", { consultaId, delta });
        },
        (finalText) => {
          const current = runtimeSessions.get(consultaId);
          const trimmed = finalText?.trim();
          if (!current || !trimmed) return;

          const sequence = current.nextSequence++;
          const inicioMs = current.lastSegmentEndMs || null;
          const finMs = Math.max(current.lastAudioEndMs, inicioMs || 0) || null;
          current.lastSegmentEndMs = finMs || current.lastSegmentEndMs;
          current.persistChain = current.persistChain
            .then(async () => {
              await persistSegment(consultaId, sequence, trimmed, { inicioMs, finMs });
              current.bufferedCharsSinceQueue += trimmed.length;

              io.to(consultaId).emit("transcription_final", {
                consultaId,
                sequence,
                text: trimmed,
              });

              const elapsedMs = Date.now() - current.lastQueueAt;
              const newSegments = sequence - current.lastQueuedSequence;
              const shouldQueueByLoad =
                current.bufferedCharsSinceQueue >= EXTRACTION_MIN_CHARS &&
                newSegments >= EXTRACTION_MIN_SEGMENTS &&
                elapsedMs >= EXTRACTION_MIN_INTERVAL_MS;

              if (shouldQueueByLoad) {
                await queueIncrementalExtraction(consultaId, sequence, "streaming_batch");
                current.lastQueuedSequence = sequence;
                current.bufferedCharsSinceQueue = 0;
                current.lastQueueAt = Date.now();
              }
            })
            .catch((error) => {
              logger.error("Error persisting realtime transcription segment:", error);
            });
        }
      );

      await aiService.connect();
      runtime.service = aiService;
      runtimeSessions.set(consultaId, runtime);
      logger.info("[socket] realtime-session:ready", {
        consultaId,
        nextSequence,
        reused: false,
      });
      return runtime;
    })();

    pendingRuntimeSessions.set(consultaId, connection);
    try {
      return await connection;
    } catch (error) {
      runtimeSessions.delete(consultaId);
      logger.error("[socket] realtime-session:failed", {
        consultaId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      pendingRuntimeSessions.delete(consultaId);
    }
  };

  io.on("connection", (socket: Socket) => {
    const user = (socket.data as any).user as SocketUser;
    const joinedConsultations = new Set<string>();
    logger.info(`Socket connected ${socket.id} (user=${user?.sub || "unknown"})`);

    socket.on("join_consultation", async (payload: JoinPayload) => {
      const consultaId = typeof payload === "string" ? payload : payload?.consultaId;
      const doctorId = user?.sub;
      logger.info("[socket] join:start", {
        socketId: socket.id,
        consultaId,
        doctorId,
      });

      if (!consultaId || !doctorId) {
        socket.emit("transcription_error", { message: "Consulta invalida o usuario no autenticado" });
        return;
      }

      try {
        const consultation = await getDoctorConsultation(consultaId, doctorId);
        if (!consultation) {
          logger.warn("[socket] join:not-authorized", {
            socketId: socket.id,
            consultaId,
            doctorId,
          });
          socket.emit("transcription_error", { message: "No autorizado para esta consulta" });
          return;
        }

        socket.join(consultaId);
        joinedConsultations.add(consultaId);

        const persistedText = (consultation.transcripcion || (await fetchPersistedTranscript(consultaId))).trim();
        socket.emit("transcription_sync", { consultaId, text: persistedText });

        const hadSession = runtimeSessions.has(consultaId);
        let realtimeReady = true;
        try {
          await ensureRealtimeSession(consultaId);
        } catch (realtimeError) {
          realtimeReady = false;
          logger.error("[socket] join:realtime-unavailable", {
            socketId: socket.id,
            consultaId,
            message: realtimeError instanceof Error ? realtimeError.message : String(realtimeError),
          });
          socket.emit("transcription_error", {
            message: "La transcripcion en vivo no inicio. Se usara transcripcion final al detener.",
          });
        }
        logger.info("[socket] join:done", {
          socketId: socket.id,
          consultaId,
          resumed: hadSession,
          realtimeReady,
          persistedChars: persistedText.length,
        });
        socket.emit("consultation_joined", { consultaId, resumed: hadSession, realtimeReady });
      } catch (error) {
        logger.error("Error joining consultation room:", error);
        socket.emit("transcription_error", { message: "No se pudo iniciar el canal de transcripcion" });
      }
    });

    socket.on("audio_chunk", async (data: AudioChunkPayload) => {
      const consultaId = data?.consultaId;
      if (!consultaId || !data?.chunk) return;
      if (!socket.rooms.has(consultaId)) return;

      try {
        const session = runtimeSessions.get(consultaId) ?? (await ensureRealtimeSession(consultaId));
        const base64Audio = normalizeAudioChunk(data.chunk);
        if (!base64Audio) return;
        session.audioChunksReceived += 1;
        const safeEndMs = Number(data.endMs || 0);
        if (Number.isFinite(safeEndMs) && safeEndMs > session.lastAudioEndMs) {
          session.lastAudioEndMs = safeEndMs;
        }
        if (session.audioChunksReceived === 1 || session.audioChunksReceived % 50 === 0) {
          logger.info("[socket] audio-chunk:received", {
            consultaId,
            chunks: session.audioChunksReceived,
            sampleRate: data.sampleRate || null,
            encoding: data.encoding || null,
            endMs: safeEndMs || null,
          });
        }
        session.service.sendAudio(base64Audio);
      } catch (error) {
        logger.error("Error handling audio chunk:", error);
        const now = Date.now();
        const lastNotified = realtimeFailureNotifiedAt.get(consultaId) || 0;
        if (now - lastNotified > 10_000) {
          realtimeFailureNotifiedAt.set(consultaId, now);
          socket.emit("transcription_error", {
            message: "Transcripcion en vivo no disponible. Se procesara el audio al detener.",
          });
        }
      }
    });

    socket.on("stop_transcription", async (data: StopPayload) => {
      const consultaId = data?.consultaId;
      const doctorId = user?.sub;
      if (!consultaId || !doctorId) return;

      try {
        const consultation = await getDoctorConsultation(consultaId, doctorId);
        if (!consultation) {
          socket.emit("transcription_error", { message: "No autorizado para detener esta consulta" });
          return;
        }

        const runtime = runtimeSessions.get(consultaId);
        if (runtime) {
          clearIdleTimer(consultaId);
          await runtime.service.flushAudio();
          await runtime.persistChain.catch(() => {});
          runtime.service.disconnect();
          runtimeSessions.delete(consultaId);
          realtimeFailureNotifiedAt.delete(consultaId);
        }

        const maxSequence = await fetchMaxSequence(consultaId);
        if (maxSequence > 0) {
          await queueIncrementalExtraction(consultaId, maxSequence, "stop_transcription");
        }

        socket.emit("transcription_stopped", {
          consultaId,
          queuedExtraction: true,
          maxSequence,
        });

        logger.info(`Stopped transcription and queued extraction for ${consultaId}`);
      } catch (error) {
        logger.error("Error stopping transcription:", error);
        socket.emit("transcription_error", { message: "No se pudo cerrar la transcripcion" });
      }
    });

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
      for (const consultaId of joinedConsultations) {
        const listeners = io.sockets.adapter.rooms.get(consultaId)?.size ?? 0;
        if (listeners === 0 && runtimeSessions.has(consultaId)) {
          scheduleIdleCleanup(consultaId);
        }
      }
      joinedConsultations.clear();
    });
  });

  return io;
}
