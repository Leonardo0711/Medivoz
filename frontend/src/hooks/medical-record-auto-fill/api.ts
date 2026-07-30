import { toast } from "sonner";
import api from "@/lib/api";
import { MedicalRecordData } from "./types";
import { logger } from "@/utils/logger";

type AutoFillSection = {
  nombre: string;
  textoActual?: string | null;
  textoSugeridoIa?: string | null;
  estado?: string | null;
};

const emptyRecord: MedicalRecordData = {
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

const isMedicalRecordField = (name: string): name is keyof MedicalRecordData => name in emptyRecord;

const mapSectionsToRecord = (sections: AutoFillSection[]) => {
  const next = { ...emptyRecord };
  for (const section of sections) {
    if (isMedicalRecordField(section.nombre)) {
      next[section.nombre] = section.textoActual || section.textoSugeridoIa || "";
    }
  }
  return next;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForQueuedRecord = async (consultaId: string, controller: AbortController): Promise<MedicalRecordData | null> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (controller.signal.aborted) throw new Error("Auto-fill request timed out");
    await sleep(attempt === 0 ? 700 : 1000);

    logger.info("Polling queued medical record", { consultaId, attempt: attempt + 1 });
    const response = await api.get(`/scribe/record/${consultaId}`, {
      signal: controller.signal,
    });
    const sections = (response.data?.sections || []) as AutoFillSection[];
    const record = mapSectionsToRecord(sections);
    const hasData = Object.values(record).some((value) => value.trim().length > 0);
    const hasPendingIa = sections.some((section) =>
      section?.estado === "borrador_ia" && String(section?.textoSugeridoIa || "").trim()
    );
    logger.info("Queued medical record poll result", {
      consultaId,
      attempt: attempt + 1,
      sectionCount: sections.length,
      hasData,
      hasPendingIa,
    });
    if (hasPendingIa || (hasData && attempt >= 2)) return record;
  }
  return null;
};

export const invokeAutoFillFunction = async (
  transcription: string,
  controller: AbortController,
  options?: { consultaId?: string | null }
): Promise<MedicalRecordData | null> => {
  if (!transcription || transcription.trim().length < 20) {
    logger.error("Transcription too short for auto-fill", { length: transcription.length });
    toast.error("La transcripcion es demasiado corta para ser analizada");
    return null;
  }

  logger.log("Sending transcription to AI for analysis, length:", transcription.length);

  try {
    const response = await api.post("/scribe/auto-fill", {
      transcription,
      consultaId: options?.consultaId || undefined,
    }, {
      signal: controller.signal,
    });
    const data = response.data;

    if (data?.queued && options?.consultaId) {
      logger.info("Auto-fill queued", {
        consultaId: options.consultaId,
        jobId: data.job?.jobId,
        queued: data.job?.queued,
        coalesced: data.job?.coalesced,
        state: data.job?.state,
      });
      toast.info("Procesando ficha con IA por secciones...");
      const queuedRecord = await waitForQueuedRecord(options.consultaId, controller);
      if (!queuedRecord) {
        toast.warning("La IA sigue procesando. Actualiza la ficha en unos segundos.");
      }
      return queuedRecord;
    }

    if (!data?.medicalRecord) {
      logger.error("No medical record data returned from API");
      throw new Error("No se pudo generar la ficha medica automaticamente");
    }

    logger.log("Received medical record data from AI");

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
      logger.warn("Auto-fill returned incomplete data");
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
