import { useState, useEffect, useCallback, useRef } from "react";
import { exportMedicalRecordPDF } from "./use-medical-record-pdf";
import {
  fetchTranscriptionData,
  checkRecordExists,
  fetchExistingRecord,
  fetchRecordValidation,
  fetchPatientData,
  refineMedicalRecordSection,
  retryMedicalRecordSection,
  reviewMedicalRecordSection,
  saveMedicalRecord,
  MedicalRecordFormData,
  PatientData,
  RecordSummaryData,
  SectionMetaMap,
} from "./use-medical-record-api";
import { logger } from "@/utils/logger";
import { toast } from "sonner";
import { useRecordEditTimer } from "./use-record-edit-timer";

export function useMedicalRecord(sessionId: string | null, patientId: string | null) {
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcriptionSnippet, setTranscriptionSnippet] = useState<string>("");
  const [fullTranscription, setFullTranscription] = useState<string>("");
  const [showFullTranscription, setShowFullTranscription] = useState(false);
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [recordExists, setRecordExists] = useState(false);
  const [sectionMeta, setSectionMeta] = useState<SectionMetaMap>({});
  const [summaryData, setSummaryData] = useState<
    Partial<Record<keyof MedicalRecordFormData, string>>
  >({});
  const [recordSummary, setRecordSummary] = useState<RecordSummaryData>({
    resumenSugeridoIa: "",
    resumenActual: "",
    notaEssi: "",
  });
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const {
    elapsedMs: editElapsedMs,
    isTiming: isEditTiming,
    markActivity: markEditActivity,
    snapshot: snapshotEditTimer,
    clearFieldDuration,
    resetAfterSave: resetEditTimerAfterSave,
  } = useRecordEditTimer(sessionId);

  const [formData, setFormData] = useState<MedicalRecordFormData>({
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
  });
  const dirtyFieldsRef = useRef<Set<keyof MedicalRecordFormData>>(new Set());
  const dirtyRecordSummaryRef = useRef({ resumenActual: false, notaEssi: false });

  const loadTranscription = useCallback(async () => {
    if (!sessionId) return "";

    logger.log("Fetching transcription data for session:", sessionId);
    try {
      const transcription = await fetchTranscriptionData(sessionId);
      if (transcription) {
        logger.log("Transcription loaded, length:", transcription.length);
        setFullTranscription(transcription);

        // Get the first 200 characters as snippet
        const snippet = transcription.substring(0, 200) + (transcription.length > 200 ? "..." : "");
        setTranscriptionSnippet(snippet);
        return transcription;
      } else {
        logger.warn("No transcription found for session:", sessionId);
        return "";
      }
    } catch (error) {
      logger.error("Error loading transcription:", error);
      return "";
    }
  }, [sessionId]);

  const loadRecordData = useCallback(async () => {
    if (!sessionId || !patientId) return;

    logger.log("Checking if record exists for session:", sessionId, "and patient:", patientId);
    try {
      const exists = await checkRecordExists(sessionId, patientId);
      setRecordExists(exists);

      if (exists) {
        logger.log("Record exists, loading data");
        const recordData = await fetchExistingRecord(sessionId, patientId);
        if (recordData) {
          logger.log("Record data loaded");
          setFormData((previous) => {
            const next = { ...recordData.formData };
            for (const field of dirtyFieldsRef.current) {
              next[field] = previous[field];
            }
            return next;
          });
          setSectionMeta(recordData.sectionMeta);
          setRecordSummary((previous) => ({
            resumenSugeridoIa: recordData.recordSummary.resumenSugeridoIa,
            resumenActual: dirtyRecordSummaryRef.current.resumenActual
              ? previous.resumenActual
              : recordData.recordSummary.resumenActual,
            notaEssi: dirtyRecordSummaryRef.current.notaEssi
              ? previous.notaEssi
              : recordData.recordSummary.notaEssi,
          }));
          const nextSummary: Partial<Record<keyof MedicalRecordFormData, string>> = {};
          for (const [field, meta] of Object.entries(recordData.sectionMeta)) {
            nextSummary[field as keyof MedicalRecordFormData] =
              meta?.resumenActual || meta?.resumenSugeridoIa || "";
          }
          setSummaryData(nextSummary);
          logger.info("Medical record state hydrated", {
            sessionId,
            sectionMetaCount: Object.keys(recordData.sectionMeta).length,
            summaryCount: Object.values(nextSummary).filter((value) => value?.trim()).length,
            hasRecordSummary: Boolean(
              recordData.recordSummary.resumenActual || recordData.recordSummary.resumenSugeridoIa
            ),
          });
        }
      } else {
        logger.log("No existing record found, will create new when saved");
      }
    } catch (error) {
      logger.error("Error checking record existence:", error);
    }
  }, [sessionId, patientId]);

  const loadPatientData = useCallback(async () => {
    if (!patientId) return;

    logger.log("Loading patient data for patient:", patientId);
    try {
      const data = await fetchPatientData(patientId);
      if (data) {
        logger.log("Patient data loaded");
        setPatientData(data);
      }
    } catch (error) {
      logger.error("Error loading patient data:", error);
    }
  }, [patientId]);

  // Initial load of data when component mounts or ids change
  useEffect(() => {
    dirtyFieldsRef.current.clear();
    dirtyRecordSummaryRef.current = { resumenActual: false, notaEssi: false };
    const loadAllData = async () => {
      setIsLoading(true);
      try {
        if (sessionId) {
          logger.log("Loading transcription for session:", sessionId);
          await loadTranscription();
        }

        if (patientId) {
          logger.log("Loading patient data for patient:", patientId);
          await loadPatientData();
        }

        if (sessionId && patientId) {
          logger.log("Loading record data for session:", sessionId, "and patient:", patientId);
          await loadRecordData();
        }
      } catch (error) {
        logger.error("Error loading data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllData();
  }, [sessionId, patientId, loadTranscription, loadPatientData, loadRecordData]);

  const refreshTranscription = useCallback(async () => {
    const transcription = await loadTranscription();
    return transcription;
  }, [loadTranscription]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      const field = name as keyof MedicalRecordFormData;
      dirtyFieldsRef.current.add(field);
      markEditActivity(field);
      setFormData((prev) => ({ ...prev, [name]: value }));
    },
    [markEditActivity]
  );

  const handleAcceptSuggestion = useCallback(
    async (field: keyof MedicalRecordFormData) => {
      const suggestion = sectionMeta[field]?.textoSugeridoIa;
      if (!sessionId) return false;
      const visibleText = formData[field] || "";
      const doctorEditedSuggestion = Boolean(
        suggestion?.trim() && visibleText.trim() && visibleText.trim() !== suggestion.trim()
      );
      const currentText = visibleText || suggestion || "";
      const summary = doctorEditedSuggestion
        ? visibleText
        : sectionMeta[field]?.resumenSugeridoIa || summaryData[field] || "";

      if (!currentText.trim() && !summary.trim()) {
        toast.warning("Primero debe existir texto o una sugerencia IA para validar esta seccion.");
        return false;
      }

      if (suggestion && !doctorEditedSuggestion && !visibleText.trim()) {
        setFormData((prev) => ({ ...prev, [field]: suggestion }));
      }
      setSummaryData((prev) => ({
        ...prev,
        [field]: summary,
      }));
      const timer = await snapshotEditTimer();
      await reviewMedicalRecordSection(sessionId, field, "accept", {
        contenido: currentText,
        resumenActual: summary,
        duracionEdicionMs: timer.fieldDurationsMs[field] || 0,
        sesionEdicionId: timer.editSessionId || undefined,
      });
      dirtyFieldsRef.current.delete(field);
      clearFieldDuration(field);
      logger.info("Medical record section accepted", {
        sessionId,
        field,
        hadSuggestion: Boolean(suggestion),
        doctorEditedSuggestion,
        hadSummary: Boolean(summary.trim()),
      });
      setSectionMeta((prev) => ({
        ...prev,
        [field]: prev[field]
          ? {
              ...prev[field]!,
              textoActual: currentText,
              textoSugeridoIa: null,
              resumenActual: summary || prev[field]!.resumenActual,
              resumenSugeridoIa: null,
              estado: "revisada",
            }
          : {
              nombre: field,
              textoActual: currentText,
              textoSugeridoIa: null,
              resumenActual: summary,
              resumenSugeridoIa: null,
              estado: "revisada",
              confianza: null,
              origenDato: null,
            },
      }));
      return true;
    },
    [clearFieldDuration, formData, sectionMeta, sessionId, snapshotEditTimer, summaryData]
  );

  const handleRejectSuggestion = useCallback(
    async (field: keyof MedicalRecordFormData) => {
      if (!sessionId) return false;
      await reviewMedicalRecordSection(sessionId, field, "reject");
      logger.info("Medical record section rejected", { sessionId, field });
      setSectionMeta((prev) => ({
        ...prev,
        [field]: prev[field]
          ? {
              ...prev[field]!,
              textoSugeridoIa: null,
              resumenSugeridoIa: null,
              estado: prev[field]!.textoActual ? "revisada" : "vacia",
            }
          : prev[field],
      }));
      return true;
    },
    [sessionId]
  );

  const handleSummaryChange = useCallback(
    (field: keyof MedicalRecordFormData, value: string) => {
      markEditActivity(field);
      setSummaryData((prev) => ({ ...prev, [field]: value }));
    },
    [markEditActivity]
  );

  const handleRecordSummaryChange = useCallback(
    (value: string) => {
      dirtyRecordSummaryRef.current.resumenActual = true;
      markEditActivity(null);
      setRecordSummary((prev) => ({
        ...prev,
        resumenActual: value,
      }));
    },
    [markEditActivity]
  );

  const handleEssiNoteChange = useCallback((value: string) => {
    dirtyRecordSummaryRef.current.notaEssi = true;
    setRecordSummary((prev) => ({
      ...prev,
      notaEssi: value,
    }));
  }, []);

  const refreshValidation = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await fetchRecordValidation(sessionId);
      logger.info("Medical record validation loaded", {
        sessionId,
        ok: result.ok,
        missingRequired: result.missingRequired.length,
        pendingReview: result.pendingReview.length,
      });
      setValidationWarnings([
        ...result.missingRequired.map((item) => item.mensaje),
        ...result.pendingReview.map((item) => item.mensaje),
      ]);
    } catch (error) {
      logger.warn("No se pudo obtener validacion clinica", error);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId && recordExists) {
      void refreshValidation();
    }
  }, [recordExists, refreshValidation, sessionId]);

  const handleBlockSection = useCallback(
    async (field: keyof MedicalRecordFormData) => {
      if (!sessionId) return false;
      await reviewMedicalRecordSection(sessionId, field, "block");
      logger.info("Medical record section blocked", { sessionId, field });
      setSectionMeta((prev) => ({
        ...prev,
        [field]: prev[field] ? { ...prev[field]!, estado: "bloqueada" } : prev[field],
      }));
      return true;
    },
    [sessionId]
  );

  const handleRetrySection = useCallback(
    async (field: keyof MedicalRecordFormData) => {
      if (!sessionId) return false;
      try {
        const result = await retryMedicalRecordSection(sessionId, field);
        logger.info("Medical record section retry queued", {
          sessionId,
          field,
          jobId: result?.job?.jobId,
          state: result?.job?.state,
        });
        toast.info("IA reintentando esta seccion. Actualizare la ficha en unos segundos.");
        window.setTimeout(() => {
          void loadRecordData();
          void refreshValidation();
        }, 2500);
        return true;
      } catch (error) {
        logger.error("Error retrying medical record section", { sessionId, field, error });
        toast.error("No se pudo reintentar esta seccion con IA.");
        return false;
      }
    },
    [loadRecordData, refreshValidation, sessionId]
  );

  const handleRefineSection = useCallback(
    async (field: keyof MedicalRecordFormData) => {
      if (!sessionId) return false;
      try {
        const result = await refineMedicalRecordSection(sessionId, field, "formato_institucional");
        const suggestion = result?.suggestion?.trim?.() || "";
        if (!suggestion) {
          toast.warning("La IA no pudo proponer una mejora para esta seccion.");
          return false;
        }
        setSectionMeta((prev) => ({
          ...prev,
          [field]: prev[field]
            ? {
                ...prev[field]!,
                textoSugeridoIa: suggestion,
                resumenSugeridoIa: suggestion,
                estado: "borrador_ia",
              }
            : {
                nombre: field,
                textoActual: formData[field] || null,
                textoSugeridoIa: suggestion,
                resumenActual: null,
                resumenSugeridoIa: suggestion,
                estado: "borrador_ia",
                confianza: null,
                origenDato: null,
              },
        }));
        logger.info("Medical record section refined", {
          sessionId,
          field,
          suggestionChars: suggestion.length,
        });
        toast.success("IA propuso una version breve. Revisa y valida si te sirve.");
        return true;
      } catch (error) {
        logger.error("Error refining medical record section", { sessionId, field, error });
        toast.error("No se pudo mejorar esta seccion con IA.");
        return false;
      }
    },
    [formData, sessionId]
  );

  const toggleTranscriptionView = useCallback(() => {
    setShowFullTranscription((prev) => !prev);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const editTimer = await snapshotEditTimer();

      const saved = await saveMedicalRecord(
        formData,
        patientId || "",
        sessionId || "",
        recordExists,
        setIsSaving,
        editTimer.fieldDurationsMs,
        summaryData,
        sectionMeta,
        recordSummary,
        editTimer.editSessionId,
        editTimer.totalDurationMs
      );
      if (saved) {
        dirtyFieldsRef.current.clear();
        dirtyRecordSummaryRef.current = { resumenActual: false, notaEssi: false };
        logger.info("Medical record saved from hook", {
          sessionId,
          sectionCount: Object.values(formData).filter((value) => value.trim()).length,
          hasRecordSummary: Boolean(
            recordSummary.resumenActual.trim() || recordSummary.resumenSugeridoIa.trim()
          ),
        });
        resetEditTimerAfterSave();
        await refreshValidation();
      }
      return saved;
    } catch (error) {
      logger.error("Error saving medical record:", error);
      return false;
    }
  }, [
    formData,
    patientId,
    sessionId,
    recordExists,
    summaryData,
    sectionMeta,
    recordSummary,
    refreshValidation,
    resetEditTimerAfterSave,
    snapshotEditTimer,
  ]);

  const handleExportPDF = useCallback(async () => {
    try {
      return await exportMedicalRecordPDF(patientData, formData, setIsExporting);
    } catch (error) {
      logger.error("Error exporting PDF:", error);
      return false;
    }
  }, [patientData, formData]);

  return {
    formData,
    patientData,
    transcriptionSnippet,
    fullTranscription,
    showFullTranscription,
    isSaving,
    isExporting,
    isLoading,
    handleChange,
    toggleTranscriptionView,
    handleSave,
    handleExportPDF,
    setFormData,
    summaryData,
    handleSummaryChange,
    recordSummary,
    handleRecordSummaryChange,
    handleEssiNoteChange,
    sectionMeta,
    validationWarnings,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleBlockSection,
    handleRetrySection,
    handleRefineSection,
    recordExists,
    refreshTranscription,
    refreshRecordData: loadRecordData,
    editElapsedMs,
    isEditTiming,
  };
}

// Re-export the types from API file for convenience
export type { MedicalRecordFormData, PatientData } from "./use-medical-record-api";
