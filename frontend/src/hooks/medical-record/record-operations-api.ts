import { toast } from "sonner";
import api from "@/lib/api";
import { MedicalRecordFormData } from "./types";
import { logger } from "@/utils/logger";

const EMPTY_FORM: MedicalRecordFormData = {
  motivo_consulta: "",
  tiempo_enfermedad: "",
  forma_inicio: "",
  curso_enfermedad: "",
  historia_cronologica: "",
  antecedentes: "",
  sintomas_principales: "",
  estado_funcional_basal: "",
  estudios_previos: "",
  notas_adicionales: "",
};

const mapSectionsToForm = (sections: Array<{ nombre: string; textoActual?: string | null }>) => {
  const form = { ...EMPTY_FORM };
  for (const section of sections) {
    if (section.nombre in form) {
      (form as any)[section.nombre] = section.textoActual || "";
    }
  }
  return form;
};

export const checkRecordExists = async (sessionId: string, _patientId: string) => {
  try {
    await api.get(`/scribe/record/${sessionId}`);
    return true;
  } catch (error: any) {
    if (error.response?.status === 404) return false;
    logger.error("Error checking if record exists:", error);
    return false;
  }
};

export const fetchExistingRecord = async (sessionId: string, _patientId: string) => {
  try {
    const response = await api.get(`/scribe/record/${sessionId}`);
    const data = response.data;
    const sections = data?.sections || [];
    const formData = mapSectionsToForm(sections);
    toast.info("Ficha medica existente cargada");
    return formData;
  } catch (error: any) {
    if (error.response?.status === 404) return null;
    logger.error("Error fetching existing record:", error);
    return null;
  }
};
