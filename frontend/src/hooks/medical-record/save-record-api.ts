import api from "@/lib/api";
import { toast } from "sonner";
import { MedicalRecordFormData } from "./types";
import { logger } from "@/utils/logger";

export const saveMedicalRecord = async (
  formData: MedicalRecordFormData,
  patientId: string,
  sessionId: string,
  _recordExists: boolean,
  setIsSaving: (value: boolean) => void
) => {
  if (!patientId || !sessionId) {
    toast.error("No hay un paciente o sesion seleccionada");
    return false;
  }

  if (!formData.motivo_consulta || !formData.historia_cronologica) {
    toast.error("Por favor, completa el motivo de consulta y la historia cronologica");
    return false;
  }

  setIsSaving(true);

  try {
    const secciones = [
      { nombre: "motivo_consulta", contenido: formData.motivo_consulta },
      { nombre: "tiempo_enfermedad", contenido: formData.tiempo_enfermedad },
      { nombre: "forma_inicio", contenido: formData.forma_inicio },
      { nombre: "curso_enfermedad", contenido: formData.curso_enfermedad },
      { nombre: "historia_cronologica", contenido: formData.historia_cronologica },
      { nombre: "antecedentes", contenido: formData.antecedentes },
      { nombre: "sintomas_principales", contenido: formData.sintomas_principales },
      { nombre: "estado_funcional_basal", contenido: formData.estado_funcional_basal },
      { nombre: "estudios_previos", contenido: formData.estudios_previos },
      { nombre: "notas_adicionales", contenido: formData.notas_adicionales },
    ].filter((section) => section.contenido);

    await api.post("/scribe/save", {
      consultaId: sessionId,
      pacienteId: patientId,
      secciones,
    });

    toast.success("Ficha medica guardada exitosamente");
    return true;
  } catch (error: any) {
    logger.error("Error saving medical record:", error);
    const message = error.response?.data?.error || "Error desconocido";
    toast.error(`Error al guardar la ficha medica: ${message}`);
    return false;
  } finally {
    setIsSaving(false);
  }
};
