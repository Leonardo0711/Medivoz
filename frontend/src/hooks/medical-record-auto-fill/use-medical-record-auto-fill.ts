
import { useState } from "react";
import { toast } from "sonner";
import { MedicalRecordData } from "./types";
import { invokeAutoFillFunction } from "./api";
import { createTimeoutController } from "./timeout-utils";
import { logger } from "@/utils/logger";

export function useMedicalRecordAutoFill() {
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillData, setAutoFillData] = useState<MedicalRecordData | null>(null);

  const autoFillMedicalRecord = async (transcription: string): Promise<MedicalRecordData | null> => {
    if (!transcription || transcription.trim().length < 20) {
      logger.error("Transcription too short:", transcription);
      toast.error("La transcripción es demasiado corta para ser analizada");
      return null;
    }
    
    setIsAutoFilling(true);
    toast.info("Analizando transcripción con IA...");
    
    try {
      // Create an AbortController for timeout handling
      const { controller, clearTimeout } = createTimeoutController(30000);
      
      try {
        const medicalRecord = await invokeAutoFillFunction(transcription, controller);
        
        // Clear the timeout since the request completed
        clearTimeout();
        
        if (medicalRecord) {
          setAutoFillData(medicalRecord);
          return medicalRecord;
        }
        
        return null;
      } catch (abortError) {
        // Clear the timeout to prevent memory leaks
        clearTimeout();
        throw abortError;
      }
    } catch (error: unknown) {
      // Check if it's a timeout error
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      if (errorMessage === "Auto-fill request timed out") {
        logger.error("La solicitud de auto-rellenado ha excedido el tiempo límite");
        toast.error("La solicitud ha tardado demasiado tiempo. Intente nuevamente");
      } else {
        logger.error("Error en autoFillMedicalRecord:", error);
        toast.error("Error al procesar la transcripción: " + errorMessage);
      }
      return null;
    } finally {
      setIsAutoFilling(false);
    }
  };

  return {
    isAutoFilling,
    autoFillData,
    autoFillMedicalRecord
  };
}
