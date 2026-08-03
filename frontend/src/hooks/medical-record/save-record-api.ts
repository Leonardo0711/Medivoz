import api, { getApiErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { MedicalRecordFormData, RecordSummaryData } from "./types";
import { logger } from "@/utils/logger";

export const saveMedicalRecord = async (
  formData: MedicalRecordFormData,
  patientId: string,
  sessionId: string,
  _recordExists: boolean,
  setIsSaving: (value: boolean) => void,
  editDurationsMs: Partial<Record<keyof MedicalRecordFormData, number>> = {},
  summaryData: Partial<Record<keyof MedicalRecordFormData, string>> = {},
  sectionMeta: Partial<
    Record<
      keyof MedicalRecordFormData,
      {
        textoSugeridoIa?: string | null;
        resumenSugeridoIa?: string | null;
        resumenActual?: string | null;
        confianza?: string | null;
        origenDato?: string | null;
      }
    >
  > = {},
  recordSummary: RecordSummaryData = { resumenSugeridoIa: "", resumenActual: "", notaEssi: "" },
  editSessionId: string | null = null,
  editSessionDurationMs = 0
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
      {
        nombre: "motivo_consulta",
        contenido: formData.motivo_consulta,
        duracionEdicionMs: editDurationsMs.motivo_consulta,
      },
      {
        nombre: "tiempo_enfermedad",
        contenido: formData.tiempo_enfermedad,
        duracionEdicionMs: editDurationsMs.tiempo_enfermedad,
      },
      {
        nombre: "forma_inicio",
        contenido: formData.forma_inicio,
        duracionEdicionMs: editDurationsMs.forma_inicio,
      },
      {
        nombre: "curso_enfermedad",
        contenido: formData.curso_enfermedad,
        duracionEdicionMs: editDurationsMs.curso_enfermedad,
      },
      {
        nombre: "historia_cronologica",
        contenido: formData.historia_cronologica,
        duracionEdicionMs: editDurationsMs.historia_cronologica,
      },
      {
        nombre: "antecedentes",
        contenido: formData.antecedentes,
        duracionEdicionMs: editDurationsMs.antecedentes,
      },
      {
        nombre: "sintomas_principales",
        contenido: formData.sintomas_principales,
        duracionEdicionMs: editDurationsMs.sintomas_principales,
      },
      {
        nombre: "estado_funcional_basal",
        contenido: formData.estado_funcional_basal,
        duracionEdicionMs: editDurationsMs.estado_funcional_basal,
      },
      {
        nombre: "estudios_previos",
        contenido: formData.estudios_previos,
        duracionEdicionMs: editDurationsMs.estudios_previos,
      },
      {
        nombre: "notas_adicionales",
        contenido: formData.notas_adicionales,
        duracionEdicionMs: editDurationsMs.notas_adicionales,
      },
    ]
      .map((section) => {
        const key = section.nombre as keyof MedicalRecordFormData;
        return {
          ...section,
          textoSugeridoIa: sectionMeta[key]?.textoSugeridoIa ?? null,
          resumenSugeridoIa: sectionMeta[key]?.resumenSugeridoIa ?? null,
          resumenActual: summaryData[key] ?? sectionMeta[key]?.resumenActual ?? null,
          confianza: sectionMeta[key]?.confianza ?? null,
          origenDato: sectionMeta[key]?.origenDato ?? null,
        };
      })
      .filter((section) => section.contenido || section.resumenActual);

    logger.info("Saving medical record sections", {
      sessionId,
      patientId,
      sectionCount: secciones.length,
      sections: secciones.map((section) => section.nombre),
      hasOfficialSummary: Boolean(
        recordSummary.resumenActual.trim() || recordSummary.resumenSugeridoIa.trim()
      ),
    });

    await api.post("/scribe/save", {
      consultaId: sessionId,
      pacienteId: patientId,
      resumenSugeridoIa: recordSummary.resumenSugeridoIa || null,
      resumenActual: recordSummary.resumenActual || recordSummary.resumenSugeridoIa || null,
      notaEssi: recordSummary.notaEssi || null,
      sesionEdicionId: editSessionId,
      duracionEdicionSesionMs: editSessionDurationMs,
      secciones,
    });

    toast.success("Ficha médica guardada exitosamente");
    return true;
  } catch (error: unknown) {
    logger.error("Error saving medical record:", error);
    const message = getApiErrorMessage(error, "Error desconocido");
    toast.error(`Error al guardar la ficha médica: ${message}`);
    return false;
  } finally {
    setIsSaving(false);
  }
};
