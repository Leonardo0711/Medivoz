import { and, asc, eq, sql } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { Server, Socket } from "socket.io";
import { logger } from "../core/utils/logger.js";
import { db } from "../db/index.js";
import { consultations } from "../db/schema/clinical.js";
import { transcriptionSegments } from "../db/schema/scribe.js";
import { env } from "../config/env.js";
import { OpenAIRealtimeService } from "../modules/scribe/openai-realtime.service.js";
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
  bufferedCharsSinceQueue: number;
  lastQueuedSequence: number;
  lastQueueAt: number;
};

type JoinPayload = string | { consultaId: string };

type AudioChunkPayload = {
  consultaId: string;
  chunk: string;
};

type StopPayload = {
  consultaId: string;
};

const runtimeSessions = new Map<string, RuntimeSession>();
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
  const rows = await db
    .select({ texto: transcriptionSegments.texto })
    .from(transcriptionSegments)
    .where(eq(transcriptionSegments.consultaId, consultaId))
    .orderBy(asc(transcriptionSegments.numeroSecuencia));

  return rows.map((r) => r.texto).filter(Boolean).join("\n").trim();
};

const fetchNextSequence = async (consultaId: string) => {
  const rows = await db
    .select({
      maxSequence: sql<number>`coalesce(max(${transcriptionSegments.numeroSecuencia}), 0)`,
    })
    .from(transcriptionSegments)
    .where(eq(transcriptionSegments.consultaId, consultaId));

  return Number(rows[0]?.maxSequence || 0) + 1;
};

const fetchMaxSequence = async (consultaId: string) => {
  const rows = await db
    .select({
      maxSequence: sql<number>`coalesce(max(${transcriptionSegments.numeroSecuencia}), 0)`,
    })
    .from(transcriptionSegments)
    .where(eq(transcriptionSegments.consultaId, consultaId));

  return Number(rows[0]?.maxSequence || 0);
};

const persistSegment = async (consultaId: string, sequence: number, text: string) => {
  const safeText = text.trim();
  if (!safeText) return;

  await db.insert(transcriptionSegments).values({
    consultaId,
    numeroSecuencia: sequence,
    hablante: "desconocido",
    origen: "flujo_en_vivo",
    texto: safeText,
  });

  await db
    .update(consultations)
    .set({
      transcripcion: sql`trim(concat_ws(E'\n', coalesce(${consultations.transcripcion}, ''), ${safeText}))`,
      versionTranscripcion: sql`${consultations.versionTranscripcion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(consultations.id, consultaId));
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

  logger.info("Incremental extraction enqueue result:", {
    consultaId,
    segmentoDesde,
    segmentoHasta,
    trigger,
    enqueueResult,
  });
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
      return existing;
    }

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
        current.persistChain = current.persistChain
          .then(async () => {
            await persistSegment(consultaId, sequence, trimmed);
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
    return runtime;
  };

  io.on("connection", (socket: Socket) => {
    const user = (socket.data as any).user as SocketUser;
    const joinedConsultations = new Set<string>();
    logger.info(`Socket connected ${socket.id} (user=${user?.sub || "unknown"})`);

    socket.on("join_consultation", async (payload: JoinPayload) => {
      const consultaId = typeof payload === "string" ? payload : payload?.consultaId;
      const doctorId = user?.sub;

      if (!consultaId || !doctorId) {
        socket.emit("transcription_error", { message: "Consulta invalida o usuario no autenticado" });
        return;
      }

      try {
        const consultation = await getDoctorConsultation(consultaId, doctorId);
        if (!consultation) {
          socket.emit("transcription_error", { message: "No autorizado para esta consulta" });
          return;
        }

        socket.join(consultaId);
        joinedConsultations.add(consultaId);

        const persistedText = (consultation.transcripcion || (await fetchPersistedTranscript(consultaId))).trim();
        socket.emit("transcription_sync", { consultaId, text: persistedText });

        const hadSession = runtimeSessions.has(consultaId);
        await ensureRealtimeSession(consultaId);
        socket.emit("consultation_joined", { consultaId, resumed: hadSession });
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
        session.service.sendAudio(data.chunk);
      } catch (error) {
        logger.error("Error handling audio chunk:", error);
        socket.emit("transcription_error", { message: "Error procesando audio en vivo" });
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
          await runtime.persistChain.catch(() => {});
          runtime.service.disconnect();
          runtimeSessions.delete(consultaId);
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
