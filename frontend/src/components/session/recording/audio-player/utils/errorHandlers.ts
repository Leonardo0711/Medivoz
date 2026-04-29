
import { toast } from "sonner";
import { logger } from "@/utils/logger";

export const handleAudioError = (event: Event) => {
  const audioElement = event.target as HTMLAudioElement;
  const error = audioElement.error;
  logger.error("Audio error:", error);
  logger.error("Audio error code:", error?.code);
  logger.error("Audio error message:", error?.message);
  logger.error("Audio src:", audioElement?.src);
  toast.error("Error al reproducir el audio. Por favor, intente grabar nuevamente.");
};

export const createSafeErrorListener = (handler: (error: Event) => void) => {
  return (event: Event) => {
    try {
      handler(event);
    } catch (e) {
      logger.error("Error in error handler:", e);
    }
  };
};
