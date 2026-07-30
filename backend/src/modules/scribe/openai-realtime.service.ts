import WebSocket from "ws";
import { env } from "../../config/env.js";
import { logger } from "../../core/utils/logger.js";

type RealtimeMode = {
  name: "ga" | "transcription_intent";
  url: string;
  headers: Record<string, string>;
  sessionUpdate: Record<string, unknown>;
};

const realtimeModel = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
const transcriptionModel =
  process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
const transcriptionPrompt =
  process.env.OPENAI_REALTIME_TRANSCRIPTION_PROMPT ||
  "Transcribe en espanol medico. No inventes datos. Conserva terminos clinicos, dosis, fechas y negaciones.";

const buildModes = (): RealtimeMode[] => [
  {
    name: "transcription_intent",
    url: "wss://api.openai.com/v1/realtime?intent=transcription",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
    sessionUpdate: {
      type: "transcription_session.update",
      session: {
        input_audio_format: "pcm16",
        input_audio_noise_reduction: {
          type: "near_field",
        },
        input_audio_transcription: {
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
        include: ["item.input_audio_transcription.logprobs"],
      },
    },
  },
  {
    name: "ga",
    url: `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`,
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    sessionUpdate: {
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
    },
  },
];

export class OpenAIRealtimeService {
  private ws: WebSocket | null = null;
  private onTranscriptionDelta: (delta: string) => void;
  private onTranscriptionFinal: (text: string) => void;
  private pendingFlushResolve: (() => void) | null = null;
  private connectedMode: RealtimeMode["name"] | null = null;
  private sessionReady = false;

  constructor(
    onTranscriptionDelta: (delta: string) => void,
    onTranscriptionFinal: (text: string) => void
  ) {
    this.onTranscriptionDelta = onTranscriptionDelta;
    this.onTranscriptionFinal = onTranscriptionFinal;
  }

  async connect() {
    const modes = buildModes();
    let lastError: unknown = null;

    for (const mode of modes) {
      try {
        await this.connectWithMode(mode);
        this.connectedMode = mode.name;
        logger.info("[realtime] openai:session-ready", {
          mode: mode.name,
          realtimeModel,
          transcriptionModel,
        });
        return true;
      } catch (error) {
        lastError = error;
        logger.warn("[realtime] openai:connect-mode-failed", {
          mode: mode.name,
          message: error instanceof Error ? error.message : String(error),
        });
        this.disconnect();
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("No se pudo abrir sesion realtime de transcripcion");
  }

  private connectWithMode(mode: RealtimeMode) {
    this.sessionReady = false;
    this.ws = new WebSocket(mode.url, { headers: mode.headers });

    return new Promise<boolean>((resolve, reject) => {
      if (!this.ws) return reject(new Error("WS not initialized"));

      let settled = false;
      let timeout: NodeJS.Timeout | null = null;
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        resolve(true);
      };
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        reject(error);
      };

      timeout = setTimeout(() => {
        settleReject(new Error("Realtime session update timed out"));
      }, 8000);

      this.ws.on("open", () => {
        logger.info("[realtime] openai:connected", { mode: mode.name });
        this.send(mode.sessionUpdate);
      });

      this.ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event);

          if (
            event.type === "session.updated" ||
            event.type === "transcription_session.updated" ||
            event.type === "transcription_session.created"
          ) {
            this.sessionReady = true;
            settleResolve();
          }

          if (event.type === "error" && !this.sessionReady) {
            const message = event.error?.message || "Realtime session rejected";
            settleReject(new Error(message));
          }
        } catch (error) {
          logger.error("[realtime] openai:event-parse-failed", error);
          if (!this.sessionReady) {
            settleReject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });

      this.ws.on("error", (error) => {
        logger.error("[realtime] openai:error", error);
        this.resolvePendingFlush();
        settleReject(error instanceof Error ? error : new Error(String(error)));
      });

      this.ws.on("close", () => {
        logger.info("[realtime] openai:closed", {
          mode: mode.name,
          sessionReady: this.sessionReady,
        });
        this.resolvePendingFlush();
        if (!this.sessionReady) {
          settleReject(new Error("Realtime websocket closed before session was ready"));
        }
      });
    });
  }

  private handleEvent(event: any) {
    switch (event.type) {
      case "conversation.item.input_audio_transcription.delta":
        if (event.delta) this.onTranscriptionDelta(event.delta);
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) this.onTranscriptionFinal(event.transcript);
        this.resolvePendingFlush();
        break;
      case "response.audio_transcript.delta":
        if (event.delta) this.onTranscriptionDelta(event.delta);
        break;
      case "response.audio_transcript.done":
        if (event.transcript) this.onTranscriptionFinal(event.transcript);
        this.resolvePendingFlush();
        break;
      case "input_audio_buffer.speech_started":
      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed":
        logger.info("[realtime] openai:vad-event", {
          type: event.type,
          itemId: event.item_id || null,
          previousItemId: event.previous_item_id || null,
        });
        break;
      case "error":
        logger.error("[realtime] openai:event-error", event.error || event);
        this.resolvePendingFlush();
        break;
    }
  }

  sendAudio(base64Chunk: string) {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionReady) {
      this.send({
        type: "input_audio_buffer.append",
        audio: base64Chunk,
      });
    }
  }

  flushAudio(timeoutMs = 2500) {
    if (this.ws?.readyState !== WebSocket.OPEN || !this.sessionReady) return Promise.resolve();

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
    if (this.pendingFlushResolve) {
      this.pendingFlushResolve();
    }
  }

  private send(event: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  disconnect() {
    this.sessionReady = false;
    this.ws?.close();
    this.ws = null;
    this.connectedMode = null;
  }
}
