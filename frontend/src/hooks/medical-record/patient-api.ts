import api from "@/lib/api";
import { PatientData } from "./types";
import { logger } from "@/utils/logger";

// Fetch patient data
export const fetchPatientData = async (patientId: string): Promise<PatientData | null> => {
  try {
    const response = await api.get(`/clinical/patients/${patientId}`);
    const data = response.data;
    
    return {
      nombre: data.nombre,
      edad: data.edad ?? null,
      ocupacion: data.ocupacion ?? null,
      procedencia: data.procedencia ?? null,
    };
  } catch (error) {
    logger.error("Error fetching patient data:", error);
    return null;
  }
};

// Update patient's diagnostic information
export const updatePatientDiagnostic = async (patientId: string, diagnostico: string) => {
  try {
    const response = await api.patch(`/clinical/patients/${patientId}`, {
      diagnostico,
    });
    
    return !!response.data;
  } catch (error) {
    logger.error("Error updating patient diagnostic:", error);
    return false;
  }
};
