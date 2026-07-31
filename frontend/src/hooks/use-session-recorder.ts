import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import api, { refreshAuthSession } from "@/lib/api";
import { logger } from "@/utils/logger";

interface UseSessionRecorderProps {
  patientId?: string | null;
  isPatientSelected: boolean;
  onTranscriptionReady: (transcription: string) => void;
  onSessionCreated?: (sessionId: string) => void;
}

interface UseSessionRecorderReturn {
  isRecording: boolean;
  realtimeStatus: "idle" | "connecting" | "ready" | "unavailable";
  sessionId: string;
  recordingTime: number;
  dbSessionId: string | null;
  generateSessionId: () => Promise<{ sessionId: string; dbSessionId: string } | null>;
  handleStartRecording: () => Promise<boolean>;
  handleStopRecording: () => Promise<void>;
  updateSessionWithTranscription: (transcription: string, dbSessionId?: string) => Promise<void>;
}

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const MIN_VOICE_RMS = 0.0035;
const VOICE_START_CHUNKS = 2;
const VOICE_SILENCE_TAIL_CHUNKS = 8;

type VoiceGateState = {
  noiseFloor: number;
  activeChunks: number;
  silentChunks: number;
  isSendingVoice: boolean;
};

const createVoiceGateState = (): VoiceGateState => ({
  noiseFloor: 0.001,
  activeChunks: 0,
  silentChunks: 0,
  isSendingVoice: false,
});

type WindowWithLegacyAudioContext = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function useSessionRecorder({
  patientId,
  isPatientSelected,
  onTranscriptionReady,
  onSessionCreated,
}: UseSessionRecorderProps): UseSessionRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<UseSessionRecorderReturn["realtimeStatus"]>("idle");
  const [sessionId, setSessionId] = useState("");
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timerId, setTimerId] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioOutputGainRef = useRef<GainNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const activeConsultaIdRef = useRef<string | null>(null);
  const accumulatedTranscriptionRef = useRef("");
  const partialTranscriptionRef = useRef("");
  const refreshingRealtimeTokenRef = useRef(false);
  const audioCursorMsRef = useRef(0);
  const voiceGateRef = useRef<VoiceGateState>(createVoiceGateState());
  const joinWaiterRef = useRef<{
    consultaId: string;
    resolve: (ready: boolean) => void;
    timeoutId: number;
  } | null>(null);

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token");
    socketRef.current = io(SOCKET_URL, {
      auth: accessToken ? { token: accessToken } : undefined,
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 800,
      reconnectionDelayMax: 3000,
    });

    socketRef.current.io.on("reconnect_attempt", () => {
      const latestToken = localStorage.getItem("access_token");
      socketRef.current!.auth = latestToken ? { token: latestToken } : {};
    });

    socketRef.current.on("connect", () => {
      const consultaId = activeConsultaIdRef.current;
      if (consultaId) {
        setRealtimeStatus("connecting");
        socketRef.current?.emit("join_consultation", { consultaId });
      }
    });

    socketRef.current.on("consultation_joined", (data: { consultaId: string; resumed?: boolean; realtimeReady?: boolean }) => {
      logger.log("Joined consultation room:", data);
      const ready = data?.realtimeReady !== false;
      setRealtimeStatus(ready ? "ready" : "unavailable");

      const waiter = joinWaiterRef.current;
      if (waiter?.consultaId === data.consultaId) {
        window.clearTimeout(waiter.timeoutId);
        joinWaiterRef.current = null;
        waiter.resolve(ready);
      }
    });

    socketRef.current.on("transcription_sync", (data: { text: string }) => {
      const text = data?.text || "";
      accumulatedTranscriptionRef.current = text;
      onTranscriptionReady(text);
    });

    socketRef.current.on("transcription_delta", (data: { delta: string }) => {
      const delta = data?.delta || "";
      if (!delta) return;
      setRealtimeStatus("ready");
      partialTranscriptionRef.current += delta;
      const base = accumulatedTranscriptionRef.current.trim();
      const partial = partialTranscriptionRef.current.trim();
      onTranscriptionReady(base ? `${base}\n${partial}` : partial);
    });

    socketRef.current.on("transcription_final", (data: { text: string }) => {
      const chunk = (data?.text || "").trim();
      if (!chunk) return;
      setRealtimeStatus("ready");

      const nextText = accumulatedTranscriptionRef.current
        ? `${accumulatedTranscriptionRef.current}\n${chunk}`
        : chunk;

      accumulatedTranscriptionRef.current = nextText;
      partialTranscriptionRef.current = "";
      onTranscriptionReady(nextText);
    });

    socketRef.current.on("transcription_error", (data: { message?: string }) => {
      const message = data?.message || "Error en transcripcion realtime";
      logger.error("Socket transcription error:", message);
      setRealtimeStatus("unavailable");
      toast.error(message);
    });

    socketRef.current.on("connect_error", async (error) => {
      logger.error("Socket connection error:", error.message);
      if (!String(error?.message || "").includes("UNAUTHORIZED")) return;
      if (refreshingRealtimeTokenRef.current) return;

      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        toast.error("Sesion realtime expirada. Recarga la pagina e inicia sesion nuevamente.");
        return;
      }

      refreshingRealtimeTokenRef.current = true;
      try {
        await refreshAuthSession(refreshToken);
        const latestToken = localStorage.getItem("access_token");
        socketRef.current!.auth = latestToken ? { token: latestToken } : {};
        socketRef.current?.connect();
      } catch (refreshError) {
        logger.error("Realtime token refresh failed:", refreshError);
        toast.error("Sesion realtime expirada. Inicia sesion nuevamente.");
      } finally {
        refreshingRealtimeTokenRef.current = false;
      }
    });

    return () => {
      const waiter = joinWaiterRef.current;
      if (waiter) {
        window.clearTimeout(waiter.timeoutId);
        waiter.resolve(false);
        joinWaiterRef.current = null;
      }
      socketRef.current?.disconnect();
    };
  }, [onTranscriptionReady]);

  const generateSessionId = async (): Promise<{ sessionId: string; dbSessionId: string } | null> => {
    if (!patientId) {
      toast.error("Debe seleccionar un paciente primero");
      return null;
    }

    try {
      const response = await api.post("/clinical/consultations", {
        pacienteId: patientId,
        metadata: { source: "web_recorder" },
      });

      const { id, codigoSesion } = response.data;
      setSessionId(codigoSesion);
      setDbSessionId(id);

      toast.success("Consulta creada correctamente");

      if (onSessionCreated) onSessionCreated(id);
      return { sessionId: codigoSesion, dbSessionId: id };
    } catch (error) {
      logger.error("Error creating session:", error);
      toast.error("Error al crear la sesion");
      return null;
    }
  };

  const handleStartRecording = async (): Promise<boolean> => {
    if (!isPatientSelected || !patientId) {
      toast.error("Debe seleccionar un paciente primero");
      return false;
    }

    let currentDbId = dbSessionId;
    let currentCode = sessionId;

    if (!currentDbId || !currentCode) {
      const result = await generateSessionId();
      if (!result) return false;
      currentDbId = result.dbSessionId;
      currentCode = result.sessionId;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const AudioContextClass = window.AudioContext || (window as WindowWithLegacyAudioContext).webkitAudioContext;
      if (!AudioContextClass) {
        toast.error("Este navegador no soporta captura de audio en vivo");
        return false;
      }

      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentOutput = audioContext.createGain();
      silentOutput.gain.value = 0;
      const targetSampleRate = 24000;

      audioStreamRef.current = stream;
      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;
      audioOutputGainRef.current = silentOutput;

      activeConsultaIdRef.current = currentDbId;
      accumulatedTranscriptionRef.current = "";
      partialTranscriptionRef.current = "";
      audioCursorMsRef.current = 0;
      voiceGateRef.current = createVoiceGateState();
      onTranscriptionReady("");
      setRealtimeStatus("connecting");

      const realtimeReady = await new Promise<boolean>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          if (joinWaiterRef.current?.consultaId === currentDbId) {
            joinWaiterRef.current = null;
          }
          resolve(false);
        }, 12_000);

        joinWaiterRef.current = { consultaId: currentDbId, resolve, timeoutId };
        socketRef.current?.emit("join_consultation", { consultaId: currentDbId });
      });
      setRealtimeStatus(realtimeReady ? "ready" : "unavailable");

      processor.onaudioprocess = (event) => {
        if (!socketRef.current || !activeConsultaIdRef.current) return;

        const input = event.inputBuffer.getChannelData(0);
        const rms = calculateRms(input);
        const gate = voiceGateRef.current;
        const threshold = Math.max(MIN_VOICE_RMS, gate.noiseFloor * 3);
        const hasVoice = rms >= threshold;

        const startMs = audioCursorMsRef.current;
        const durationMs = Math.round((input.length / audioContext.sampleRate) * 1000);
        const endMs = startMs + durationMs;
        audioCursorMsRef.current = endMs;

        if (!gate.isSendingVoice) {
          if (hasVoice) {
            gate.activeChunks += 1;
          } else {
            gate.activeChunks = 0;
            gate.noiseFloor = gate.noiseFloor * 0.98 + rms * 0.02;
          }

          if (gate.activeChunks < VOICE_START_CHUNKS) return;
          gate.isSendingVoice = true;
          gate.silentChunks = 0;
        }

        if (hasVoice) {
          gate.silentChunks = 0;
        } else {
          gate.silentChunks += 1;
        }

        if (gate.silentChunks > VOICE_SILENCE_TAIL_CHUNKS) {
          gate.isSendingVoice = false;
          gate.activeChunks = 0;
          gate.silentChunks = 0;
          return;
        }

        const pcm16 = floatTo16BitPcm(
          downsampleBuffer(input, audioContext.sampleRate, targetSampleRate)
        );
        if (!pcm16.byteLength) return;

        socketRef.current.emit("audio_chunk", {
          consultaId: activeConsultaIdRef.current,
          chunk: pcm16.buffer,
          encoding: "pcm16",
          sampleRate: targetSampleRate,
          startMs,
          endMs,
        });
      };

      source.connect(processor);
      processor.connect(silentOutput);
      silentOutput.connect(audioContext.destination);
      await audioContext.resume();
      setIsRecording(true);
      setRecordingTime(0);

      const id = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      setTimerId(id);

      toast.success("Grabacion iniciada");
      return true;
    } catch (error) {
      logger.error("Error starting recording:", error);
      toast.error("Error al acceder al microfono");
      return false;
    }
  };

  const handleStopRecording = async () => {
    audioProcessorRef.current?.disconnect();
    audioSourceRef.current?.disconnect();
    audioOutputGainRef.current?.disconnect();
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close();
    audioProcessorRef.current = null;
    audioSourceRef.current = null;
    audioOutputGainRef.current = null;
    audioStreamRef.current = null;
    audioContextRef.current = null;

    const consultaId = activeConsultaIdRef.current || dbSessionId;
    if (consultaId) {
      socketRef.current?.emit("stop_transcription", { consultaId });
    }

    activeConsultaIdRef.current = null;
    setRealtimeStatus("idle");
    setIsRecording(false);
    if (timerId) {
      clearInterval(timerId);
      setTimerId(null);
    }

    toast.success("Grabacion detenida. Procesando ficha...");
  };

  const updateSessionWithTranscription = async (transcription: string, explicitSessionId?: string) => {
    const consultationId = explicitSessionId || dbSessionId;
    if (!consultationId || !transcription) return;

    try {
      await api.patch(`/clinical/consultations/${consultationId}`, {
        transcripcionCompleta: transcription,
      });
    } catch (error) {
      logger.error("Error updating consultation transcription:", error);
    }
  };

  return {
    isRecording,
    realtimeStatus,
    sessionId,
    recordingTime,
    dbSessionId,
    generateSessionId,
    handleStartRecording,
    handleStopRecording,
    updateSessionWithTranscription,
  };
}

const downsampleBuffer = (buffer: Float32Array, sourceRate: number, targetRate: number) => {
  if (targetRate >= sourceRate) return buffer;

  const ratio = sourceRate / targetRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
};

const floatTo16BitPcm = (input: Float32Array) => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
};

const calculateRms = (input: Float32Array) => {
  if (!input.length) return 0;

  let sumSquares = 0;
  for (let i = 0; i < input.length; i += 1) {
    sumSquares += input[i] * input[i];
  }
  return Math.sqrt(sumSquares / input.length);
};
