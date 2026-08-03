import { useState } from "react";
import { toast } from "sonner";
import { MedicalRecordData } from "./types";
import { invokeAutoFillFunction } from "./api";
import { createTimeoutController } from "./timeout-utils";
import { logger } from "@/utils/logger";

export function useMedicalRecordAutoFill() {
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillData, setAutoFillData] = useState<MedicalRecordData | null>(null);

  const autoFillMedicalRecord = async (
    transcription: string,
    options?: { consultaId?: string | null }
  ): Promise<MedicalRecordData | null> => {
    if (!transcription || transcription.trim().length < 20) {
      logger.error("Transcription too short for auto-fill", { length: transcription?.length || 0 });
      toast.error("La transcripción es demasiado corta para ser analizada");
      return null;
    }

    setIsAutoFilling(true);
    toast.info("Analizando transcripción con IA...");

    try {
      const { controller, clearTimeout } = createTimeoutController(90000);

      try {
        const medicalRecord = await invokeAutoFillFunction(transcription, controller, options);
        clearTimeout();

        if (medicalRecord) {
          setAutoFillData(medicalRecord);
          return medicalRecord;
        }

        return null;
      } catch (abortError) {
        clearTimeout();
        throw abortError;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      if (errorMessage === "Auto-fill request timed out") {
        logger.error("La solicitud de auto-rellenado excedio el tiempo limite");
        toast.error("La IA sigue procesando o la cola esta ocupada. Intenta actualizar la ficha en unos segundos.");
      } else {
        logger.error("Error en autoFillMedicalRecord:", error);
        const friendlyMessage =
          errorMessage.includes("Network") || errorMessage.includes("ERR_NETWORK")
            ? "No hay conexion con el servidor."
            : errorMessage.includes("401")
              ? "Tu sesion expiro. Vuelve a iniciar sesion."
              : "No se pudo procesar la transcripción con IA.";
        toast.error(friendlyMessage);
      }
      return null;
    } finally {
      setIsAutoFilling(false);
    }
  };

  return {
    isAutoFilling,
    autoFillData,
    autoFillMedicalRecord,
  };
}
