import { useState } from "react";
import { toast } from "sonner";
import { blobToBase64 } from "@/utils/audio";
import { logger } from "@/utils/logger";
import api from "@/lib/api";

interface UseAudioTranscriptionProps {
  onTranscriptionComplete?: (transcription: string) => void;
}

interface UseAudioTranscriptionResult {
  isTranscribing: boolean;
  transcribeAudio: (audioBlob: Blob, options?: { consultaId?: string | null }) => Promise<string>;
}

const extFromMime = (mimeType: string): string => {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("x-m4a") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("flac")) return "flac";
  return "webm";
};

export function useAudioTranscription({
  onTranscriptionComplete,
}: UseAudioTranscriptionProps = {}): UseAudioTranscriptionResult {
  const [isTranscribing, setIsTranscribing] = useState(false);

  const transcribeAudio = async (
    audioBlob: Blob,
    options?: { consultaId?: string | null }
  ): Promise<string> => {
    logger.log("Attempting to transcribe audio");
    logger.log("Audio blob exists:", !!audioBlob);

    if (!audioBlob) {
      logger.error("No audio blob available for transcription");
      toast.error("No hay audio para transcribir");
      return "";
    }

    if (audioBlob.size === 0) {
      logger.error("Audio blob is empty (size: 0)");
      toast.error("La grabacion de audio esta vacia");
      return "";
    }

    const maxAudioBytes = 25 * 1024 * 1024;
    const recommendedBytes = 18 * 1024 * 1024;

    if (audioBlob.size > maxAudioBytes) {
      toast.error("El archivo supera 25MB. Usa m4a/mp3 o divide la consulta en partes.");
      return "";
    }

    if (audioBlob.size > recommendedBytes) {
      toast.info("Audio pesado detectado. El procesamiento puede tardar.");
    }

    setIsTranscribing(true);

    try {
      const mimeType = audioBlob.type || "audio/webm";
      const filename = `consulta.${extFromMime(mimeType)}`;
      const consultaId = options?.consultaId || undefined;
      let data: any = null;

      try {
        const headers: Record<string, string> = {
          "Content-Type": mimeType,
          "X-Audio-Mime": mimeType,
          "X-Audio-Filename": filename,
        };
        if (consultaId) headers["X-Consulta-Id"] = consultaId;

        const response = await api.post("/scribe/transcribe-audio-binary", audioBlob, {
          headers,
          timeout: 240000,
        });
        data = response.data;
      } catch (binaryUploadError: any) {
        const status = binaryUploadError?.response?.status;

        if (status !== 404 && status !== 415) {
          throw binaryUploadError;
        }

        logger.warn("Binary transcription endpoint unavailable; falling back to base64 endpoint");

        logger.log("Starting base64 conversion for fallback path, blob size:", audioBlob.size);
        const base64Audio = await blobToBase64(audioBlob);
        if (!base64Audio) {
          throw new Error("Failed to convert audio to base64");
        }

        const fallbackResponse = await api.post(
          "/scribe/transcribe-audio",
          {
            audio: base64Audio,
            mimeType,
            consultaId,
          },
          {
            timeout: 240000,
          }
        );
        data = fallbackResponse.data;
      }

      logger.log("Transcription data received:", data ? "yes" : "no");

      const transcription = data?.formattedTranscription || data?.rawTranscription?.text || "";
      logger.log("Final transcription length:", transcription.length);

      if (onTranscriptionComplete && transcription) {
        onTranscriptionComplete(transcription);
      }

      return transcription;
    } catch (error) {
      logger.error("Transcription error:", error);
      const err = error as any;
      const status = err?.response?.status;
      const message = err?.response?.data?.error || err?.message || "Error al transcribir el audio";

      if (status === 413) {
        toast.error("El audio es demasiado grande para procesarlo. Reduce la duracion o comprime el archivo.");
      } else if (status === 400) {
        toast.error(`No se pudo procesar el audio: ${message}`);
      } else {
        toast.error("Error al transcribir el audio");
      }
      return "";
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
    isTranscribing,
    transcribeAudio,
  };
}
