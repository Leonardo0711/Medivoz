import WebSocket from "ws";
import { env } from "../../config/env.js";

export class OpenAIRealtimeService {
  private ws: WebSocket | null = null;
  private onTranscriptionDelta: (delta: string) => void;
  private onTranscriptionFinal: (text: string) => void;

  constructor(
    onTranscriptionDelta: (delta: string) => void,
    onTranscriptionFinal: (text: string) => void
  ) {
    this.onTranscriptionDelta = onTranscriptionDelta;
    this.onTranscriptionFinal = onTranscriptionFinal;
  }

  async connect() {
    const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error("WS not initialized"));

      this.ws.on("open", () => {
        console.log("🟢 Connected to OpenAI Realtime API");
        this.initializeSession();
        resolve(true);
      });

      this.ws.on("message", (data) => {
        const event = JSON.parse(data.toString());
        this.handleEvent(event);
      });

      this.ws.on("error", (error) => {
        console.error("🔴 OpenAI WS Error:", error);
        reject(error);
      });

      this.ws.on("close", () => {
        console.log("🟠 OpenAI WS Closed");
      });
    });
  }

  private initializeSession() {
    this.send({
      type: "session.update",
      session: {
        modalities: ["text"], // For now we only want text transcription from audio
        instructions: "Eres un asistente médico transcribiendo una consulta. Sé preciso y clínico.",
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        turn_detection: {
          type: "server_vad",
        },
      },
    });
  }

  private handleEvent(event: any) {
    // console.log("OpenAI Event:", event.type);
    
    switch (event.type) {
      case "response.audio_transcript.delta":
        this.onTranscriptionDelta(event.delta);
        break;
      case "response.audio_transcript.done":
        this.onTranscriptionFinal(event.transcript);
        break;
      // Add more cases as needed (error, rate limits, etc.)
    }
  }

  sendAudio(base64Chunk: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({
        type: "input_audio_buffer.append",
        audio: base64Chunk,
      });
    }
  }

  private send(event: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  disconnect() {
    this.ws?.close();
  }
}
