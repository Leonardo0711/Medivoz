import WebSocket from "ws";
import { env } from "../../config/env.js";
import { logger } from "../../core/utils/logger.js";

const transcriptionModel =
  process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
const transcriptionPrompt =
  process.env.OPENAI_REALTIME_TRANSCRIPTION_PROMPT ||
  "Transcribe en espanol medico. No inventes datos. Conserva terminos clinicos, dosis, fechas y negaciones.";
const realtimeUrl = "wss://api.openai.com/v1/realtime?intent=transcription";

const buildSessionUpdate = () => ({
  type: "session.update",
  session: {
    type: "transcription",
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: 24000,
        },
        noise_reduction: {
          type: "near_field",
        },
        transcription: {
          model: transcriptionModel,
          language: "es",
          prompt: transcriptionPrompt,
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    },
    include: ["item.input_audio_transcription.logprobs"],
  },
});

export class OpenAIRealtimeService {
  private ws: WebSocket | null = null;
  private onTranscriptionDelta: (delta: string) => void;
  private onTranscriptionFinal: (text: string) => void;
  private pendingFlushResolve: (() => void) | null = null;
  private sessionReady = false;
  private hasUncommittedAudio = false;

  constructor(
    onTranscriptionDelta: (delta: string) => void,
    onTranscriptionFinal: (text: string) => void
  ) {
    this.onTranscriptionDelta = onTranscriptionDelta;
    this.onTranscriptionFinal = onTranscriptionFinal;
  }

  async connect() {
    this.sessionReady = false;
    this.ws = new WebSocket(realtimeUrl, {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error("Realtime websocket no inicializado"));

      let settled = false;
      const timeout = setTimeout(() => {
        settleReject(new Error("La sesion realtime excedio el tiempo de conexion"));
      }, 10_000);

      const settleResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };

      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };

      this.ws.on("open", () => {
        logger.info("[realtime] openai:connected", {
          intent: "transcription",
          transcriptionModel,
        });
        this.send(buildSessionUpdate());
      });

      this.ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event);

          if (event.type === "session.updated" && event.session?.type === "transcription") {
            this.sessionReady = true;
            logger.info("[realtime] openai:session-ready", {
              sessionType: event.session.type,
              transcriptionModel,
            });
            settleResolve();
          }

          if (event.type === "error" && !this.sessionReady) {
            settleReject(new Error(event.error?.message || "OpenAI rechazo la sesion realtime"));
          }
        } catch (error) {
          logger.error("[realtime] openai:event-parse-failed", error);
          if (!this.sessionReady) {
            settleReject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });

      this.ws.on("error", (error) => {
        logger.error("[realtime] openai:websocket-error", {
          message: error.message,
          sessionReady: this.sessionReady,
        });
        this.sessionReady = false;
        this.resolvePendingFlush();
        settleReject(error);
      });

      this.ws.on("close", (code, reason) => {
        const wasReady = this.sessionReady;
        this.sessionReady = false;
        this.resolvePendingFlush();
        logger.info("[realtime] openai:closed", {
          code,
          reason: reason.toString() || null,
          wasReady,
        });
        if (!wasReady) {
          settleReject(new Error("OpenAI cerro el canal antes de iniciar la transcripcion"));
        }
      });
    });

    return true;
  }

  private handleEvent(event: any) {
    switch (event.type) {
      case "session.created":
        logger.info("[realtime] openai:session-created", {
          sessionType: event.session?.type || null,
        });
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (event.delta) this.onTranscriptionDelta(event.delta);
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) this.onTranscriptionFinal(event.transcript);
        this.resolvePendingFlush();
        break;
      case "input_audio_buffer.speech_started":
      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed":
        if (event.type === "input_audio_buffer.committed") {
          this.hasUncommittedAudio = false;
        }
        logger.info("[realtime] openai:audio-event", {
          type: event.type,
          itemId: event.item_id || null,
        });
        break;
      case "error":
        logger.error("[realtime] openai:event-error", {
          type: event.error?.type || null,
          code: event.error?.code || null,
          message: event.error?.message || "Error realtime sin detalle",
        });
        this.resolvePendingFlush();
        break;
    }
  }

  sendAudio(base64Chunk: string) {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.sessionReady) return false;

    this.send({
      type: "input_audio_buffer.append",
      audio: base64Chunk,
    });
    this.hasUncommittedAudio = true;
    return true;
  }

  flushAudio(timeoutMs = 3500) {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.sessionReady) return Promise.resolve();
    if (!this.hasUncommittedAudio) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingFlushResolve = null;
        resolve();
      }, timeoutMs);

      this.pendingFlushResolve = () => {
        clearTimeout(timeout);
        this.pendingFlushResolve = null;
        resolve();
      };

      this.send({ type: "input_audio_buffer.commit" });
    });
  }

  private resolvePendingFlush() {
    this.pendingFlushResolve?.();
  }

  private send(event: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  disconnect() {
    this.sessionReady = false;
    this.hasUncommittedAudio = false;
    this.resolvePendingFlush();
    this.ws?.close();
    this.ws = null;
  }
}
