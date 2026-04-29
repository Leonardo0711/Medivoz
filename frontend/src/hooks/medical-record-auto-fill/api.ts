import { toast } from "sonner";
import api from "@/lib/api";
import { MedicalRecordData } from "./types";
import { logger } from "@/utils/logger";

export const invokeAutoFillFunction = async (
  transcription: string,
  controller: AbortController
): Promise<MedicalRecordData | null> => {
  if (!transcription || transcription.trim().length < 20) {
    logger.error("Transcription too short:", transcription);
    toast.error("La transcripcion es demasiado corta para ser analizada");
    return null;
  }

  logger.log("Sending transcription to AI for analysis, length:", transcription.length);
  logger.log("First 100 chars:", transcription.substring(0, 100));

  try {
    const response = await api.post("/scribe/auto-fill", { transcription }, {
      signal: controller.signal,
    });
    const data = response.data;

    if (!data?.medicalRecord) {
      logger.error("No medical record data returned from API:", data);
      throw new Error("No se pudo generar la ficha medica automaticamente");
    }

    logger.log("Received medical record data from AI:", data.medicalRecord);

    const medicalRecord: MedicalRecordData = {
      motivo_consulta: data.medicalRecord.motivo_consulta || "",
      tiempo_enfermedad: data.medicalRecord.tiempo_enfermedad || "",
      forma_inicio: data.medicalRecord.forma_inicio || "",
      curso_enfermedad: data.medicalRecord.curso_enfermedad || "",
      historia_cronologica: data.medicalRecord.historia_cronologica || "",
      antecedentes: data.medicalRecord.antecedentes || "",
      sintomas_principales: data.medicalRecord.sintomas_principales || "",
      estado_funcional_basal: data.medicalRecord.estado_funcional_basal || "",
      estudios_previos: data.medicalRecord.estudios_previos || "",
      notas_adicionales: data.medicalRecord.notas_adicionales || "",
    };

    if (!medicalRecord.motivo_consulta || !medicalRecord.historia_cronologica) {
      logger.warn("Auto-fill returned incomplete data:", medicalRecord);
      toast.warning("La IA genero informacion incompleta. Revisa y completa manualmente.");
    } else {
      toast.success("Ficha medica generada exitosamente");
    }

    return medicalRecord;
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      logger.error("La solicitud de auto-rellenado ha excedido el tiempo limite");
      throw new Error("Auto-fill request timed out");
    }
    throw error;
  }
};
