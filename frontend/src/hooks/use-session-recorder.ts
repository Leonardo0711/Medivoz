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
  sessionId: string;
  recordingTime: number;
  dbSessionId: string | null;
  generateSessionId: () => Promise<{ sessionId: string; dbSessionId: string } | null>;
  handleStartRecording: () => void;
  handleStopRecording: () => Promise<void>;
  updateSessionWithTranscription: (transcription: string, dbSessionId?: string) => Promise<void>;
}

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export function useSessionRecorder({
  patientId,
  isPatientSelected,
  onTranscriptionReady,
  onSessionCreated,
}: UseSessionRecorderProps): UseSessionRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timerId, setTimerId] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeConsultaIdRef = useRef<string | null>(null);
  const accumulatedTranscriptionRef = useRef("");
  const refreshingRealtimeTokenRef = useRef(false);

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
        socketRef.current?.emit("join_consultation", { consultaId });
      }
    });

    socketRef.current.on("consultation_joined", (data: { consultaId: string; resumed?: boolean }) => {
      logger.log("Joined consultation room:", data);
    });

    socketRef.current.on("transcription_sync", (data: { text: string }) => {
      const text = data?.text || "";
      accumulatedTranscriptionRef.current = text;
      onTranscriptionReady(text);
    });

    socketRef.current.on("transcription_delta", (_data: { delta: string }) => {
      // Reserved for character-by-character UI if needed.
    });

    socketRef.current.on("transcription_final", (data: { text: string }) => {
      const chunk = (data?.text || "").trim();
      if (!chunk) return;

      const nextText = accumulatedTranscriptionRef.current
        ? `${accumulatedTranscriptionRef.current}\n${chunk}`
        : chunk;

      accumulatedTranscriptionRef.current = nextText;
      onTranscriptionReady(nextText);
    });

    socketRef.current.on("transcription_error", (data: { message?: string }) => {
      const message = data?.message || "Error en transcripcion realtime";
      logger.error("Socket transcription error:", message);
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

      toast.success(`Sesion ${codigoSesion} creada correctamente`);

      if (onSessionCreated) onSessionCreated(id);
      return { sessionId: codigoSesion, dbSessionId: id };
    } catch (error) {
      logger.error("Error creating session:", error);
      toast.error("Error al crear la sesion");
      return null;
    }
  };

  const handleStartRecording = async () => {
    if (!isPatientSelected || !patientId) {
      toast.error("Debe seleccionar un paciente primero");
      return;
    }

    let currentDbId = dbSessionId;
    let currentCode = sessionId;

    if (!currentDbId || !currentCode) {
      const result = await generateSessionId();
      if (!result) return;
      currentDbId = result.dbSessionId;
      currentCode = result.sessionId;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      activeConsultaIdRef.current = currentDbId;
      accumulatedTranscriptionRef.current = "";
      onTranscriptionReady("");

      socketRef.current?.emit("join_consultation", { consultaId: currentDbId });

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size <= 0 || !socketRef.current || !activeConsultaIdRef.current) return;

        const reader = new FileReader();
        reader.readAsDataURL(event.data);
        reader.onloadend = () => {
          const base64data = (reader.result as string).split(",")[1];
          socketRef.current?.emit("audio_chunk", {
            consultaId: activeConsultaIdRef.current,
            chunk: base64data,
          });
        };
      };

      mediaRecorder.start(500);
      setIsRecording(true);
      setRecordingTime(0);

      const id = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      setTimerId(id);

      toast.success("Grabacion iniciada");
    } catch (error) {
      logger.error("Error starting recording:", error);
      toast.error("Error al acceder al microfono");
    }
  };

  const handleStopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }

    const consultaId = activeConsultaIdRef.current || dbSessionId;
    if (consultaId) {
      socketRef.current?.emit("stop_transcription", { consultaId });
    }

    activeConsultaIdRef.current = null;
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
    sessionId,
    recordingTime,
    dbSessionId,
    generateSessionId,
    handleStartRecording,
    handleStopRecording,
    updateSessionWithTranscription,
  };
}
