import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, FileText, Sparkles, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { SessionRecorder } from "@/components/SessionRecorder";
import { Transcription } from "@/components/Transcription";
import { SessionPatientCard } from "@/components/session/SessionPatientCard";
import { EmptyRecordPlaceholder } from "@/components/session/EmptyRecordPlaceholder";
import { SessionTemplateCard } from "@/components/session/SessionTemplateCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MedicalRecordContainer } from "@/components/medical-record-modal/MedicalRecordContainer";
import { Patient } from "@/components/patients/PatientDialogTypes";
import { useMedicalRecord } from "@/hooks/medical-record/use-medical-record";
import { logger } from "@/utils/logger";
import api from "@/lib/api";
import { useUnsavedRecordGuard } from "@/contexts/UnsavedRecordContext";
import { AnamnesisTemplate } from "@/types/anamnesis-templates";

type AnamnesisPhase = {
  estadoAnamnesis?: string | null;
  segmentoFinAnamnesis?: number | null;
  confianzaCierreAnamnesis?: string | number | null;
  motivoCierreAnamnesis?: string | null;
};

const anamnesisPhaseLabels: Record<string, string> = {
  no_iniciada: "Anamnesis no iniciada",
  en_anamnesis: "Anamnesis en curso",
  probable_cierre: "Anamnesis probablemente cerrada",
  cerrada: "Anamnesis cerrada",
  reabierta: "Anamnesis reabierta",
};

export default function Session() {
  const [transcription, setTranscription] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [anamnesisPhase, setAnamnesisPhase] = useState<AnamnesisPhase | null>(null);
  const [isStructuringLive, setIsStructuringLive] = useState(false);
  const [templates, setTemplates] = useState<AnamnesisTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const lastTranscriptionActivityRef = useRef(0);
  const recordRefreshInFlightRef = useRef(false);
  const structuringTimeoutRef = useRef<number | null>(null);
  const [searchParams] = useSearchParams();
  const { configureGuard, requestAction } = useUnsavedRecordGuard();
  const patientId = selectedPatient?.id || null;

  const {
    formData,
    transcriptionSnippet,
    fullTranscription,
    showFullTranscription,
    isSaving,
    isExporting,
    handleChange,
    toggleTranscriptionView,
    handleSave,
    handleExportPDF,
    setFormData,
    sectionMeta,
    modifiedFields,
    recordSummary,
    validationWarnings,
    handleRecordSummaryChange,
    handleEssiNoteChange,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleBlockSection,
    handleRetrySection,
    handleRefineSection,
    recordExists,
    recordFinalized,
    hasUnsavedChanges,
    refreshTranscription,
    refreshRecordData,
    editElapsedMs,
    isEditTiming,
    validationElapsedMs,
    isValidationTiming,
    hasValidationStarted,
  } = useMedicalRecord(currentSessionId, patientId);

  const hasPendingRecordWork = Boolean(
    currentSessionId && (hasUnsavedChanges || (recordExists && !recordFinalized))
  );

  const defaultTemplateId = templates.find((template) => template.esPredeterminada)?.id || "";
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const isTemplateLocked = Boolean(
    transcription.trim() ||
      recordExists ||
      (anamnesisPhase?.estadoAnamnesis && anamnesisPhase.estadoAnamnesis !== "no_iniciada")
  );

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await api.get<AnamnesisTemplate[]>("/clinical/anamnesis-templates");
        setTemplates(response.data);
        const defaultTemplate = response.data.find((template) => template.esPredeterminada);
        setSelectedTemplateId((current) => current || defaultTemplate?.id || response.data[0]?.id || "");
      } catch (error) {
        logger.error("No se pudieron cargar las fichas:", error);
        toast.error("No se pudieron cargar las fichas disponibles");
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    void loadTemplates();
  }, []);

  useEffect(() => {
    configureGuard({
      active: hasPendingRecordWork,
      isSaving,
      onSave: handleSave,
    });
    return () => configureGuard(null);
  }, [configureGuard, handleSave, hasPendingRecordWork, isSaving]);

  const loadPatient = useCallback(async (id: string) => {
    setCurrentSessionId(null);
    setTranscription("");
    try {
      const [patientResponse, consultationsResponse] = await Promise.all([
        api.get(`/clinical/patients/${id}`),
        api.get("/clinical/consultations", { params: { pacienteId: id } }),
      ]);
      const data = patientResponse.data;
      if (data) {
        setSelectedPatient({
          id: data.id,
          nombre: data.nombre,
          dni: data.dni ?? null,
          codigoPaciente: data.codigoPaciente ?? null,
          edad: data.edad,
          ocupacion: data.ocupacion,
          procedencia: data.procedencia,
          diagnostico: data.diagnostico,
          ultima_visita: data.ultimaVisita,
        });
        const currentConsultation = Array.isArray(consultationsResponse.data)
          ? consultationsResponse.data[0]
          : null;
        if (currentConsultation?.id) {
          setCurrentSessionId(currentConsultation.id);
          setTranscription(currentConsultation.transcripcion || "");
          setSelectedTemplateId(currentConsultation.plantillaAnamnesisId || defaultTemplateId);
          setAnamnesisPhase({
            estadoAnamnesis: currentConsultation.estadoAnamnesis,
            segmentoFinAnamnesis: currentConsultation.segmentoFinAnamnesis,
            confianzaCierreAnamnesis: currentConsultation.confianzaCierreAnamnesis,
            motivoCierreAnamnesis: currentConsultation.motivoCierreAnamnesis,
          });
        } else {
          setSelectedTemplateId(defaultTemplateId);
          setAnamnesisPhase(null);
        }
      }
    } catch (requestError) {
      logger.error("Error loading patient:", requestError);
      toast.error("Error al cargar el paciente");
    }
  }, [defaultTemplateId]);

  useEffect(() => {
    const id = searchParams.get("patientId");
    if (id) loadPatient(id);
  }, [searchParams, loadPatient]);

  const handleSessionCreated = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const handlePatientSelect = useCallback(
    (patient: Patient | null) => {
      requestAction(async () => {
        if (patient?.id) {
          await loadPatient(patient.id);
          return;
        }
        setSelectedPatient(null);
        setCurrentSessionId(null);
        setTranscription("");
        setAnamnesisPhase(null);
        setSelectedTemplateId(defaultTemplateId);
      });
    },
    [defaultTemplateId, loadPatient, requestAction]
  );

  const handleTemplateChange = useCallback(async (templateId: string) => {
    const previousTemplateId = selectedTemplateId;
    setSelectedTemplateId(templateId);
    if (!currentSessionId) return;

    setIsSavingTemplate(true);
    try {
      await api.patch(`/clinical/consultations/${currentSessionId}`, {
        plantillaAnamnesisId: templateId,
      });
      toast.success("Ficha de la consulta actualizada");
    } catch (error) {
      setSelectedTemplateId(previousTemplateId);
      logger.error("No se pudo cambiar la ficha de la consulta:", error);
      toast.error("No se pudo cambiar la ficha de la consulta");
    } finally {
      setIsSavingTemplate(false);
    }
  }, [currentSessionId, selectedTemplateId]);

  const handleTranscriptionReady = useCallback((text: string) => {
    setTranscription(text);
    if (!text.trim()) return;

    lastTranscriptionActivityRef.current = Date.now();
    setIsStructuringLive(true);
    if (structuringTimeoutRef.current) {
      window.clearTimeout(structuringTimeoutRef.current);
    }
    structuringTimeoutRef.current = window.setTimeout(() => {
      setIsStructuringLive(false);
      structuringTimeoutRef.current = null;
    }, 15_000);
  }, []);

  useEffect(() => {
    return () => {
      if (structuringTimeoutRef.current) {
        window.clearTimeout(structuringTimeoutRef.current);
      }
    };
  }, []);

  const refreshAnamnesisPhase = useCallback(async () => {
    if (!currentSessionId) return;
    try {
      const response = await api.get(`/clinical/consultations/${currentSessionId}`);
      setAnamnesisPhase({
        estadoAnamnesis: response.data?.estadoAnamnesis,
        segmentoFinAnamnesis: response.data?.segmentoFinAnamnesis,
        confianzaCierreAnamnesis: response.data?.confianzaCierreAnamnesis,
        motivoCierreAnamnesis: response.data?.motivoCierreAnamnesis,
      });
    } catch (error) {
      logger.warn("No se pudo actualizar fase de anamnesis", error);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (transcription && currentSessionId) {
      const timeoutId = setTimeout(async () => {
        logger.log("Refreshing transcription from DB for session:", currentSessionId);
        await refreshTranscription();
        await refreshAnamnesisPhase();
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [transcription, currentSessionId, refreshTranscription, refreshAnamnesisPhase]);

  useEffect(() => {
    if (!currentSessionId) {
      setAnamnesisPhase(null);
      return;
    }
    void refreshAnamnesisPhase();
    const intervalId = window.setInterval(() => {
      void refreshAnamnesisPhase();
    }, 7000);
    return () => window.clearInterval(intervalId);
  }, [currentSessionId, refreshAnamnesisPhase]);

  useEffect(() => {
    if (!currentSessionId) return;

    const refreshLiveRecord = async () => {
      const activityAgeMs = Date.now() - lastTranscriptionActivityRef.current;
      if (activityAgeMs > 20_000 || recordRefreshInFlightRef.current) return;

      recordRefreshInFlightRef.current = true;
      try {
        await refreshRecordData();
        await refreshAnamnesisPhase();
      } finally {
        recordRefreshInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshLiveRecord();
    }, 2_500);
    return () => window.clearInterval(intervalId);
  }, [currentSessionId, refreshAnamnesisPhase, refreshRecordData]);

  return (
    <div className="flex min-h-screen bg-background lg:h-dvh lg:overflow-hidden">
      <Sidebar />
      <div className="app-content flex min-w-0 flex-1 flex-col max-lg:overflow-y-auto lg:overflow-hidden">
        <div className="container mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-3 md:px-5 lg:min-h-0">
          <header className="mb-3 shrink-0 rounded-md border border-border/60 bg-card px-4 py-3 shadow-sm">
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
              <div>
                <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                  <span className="rounded-md bg-primary/10 p-1.5">
                    <Stethoscope className="h-5 w-5 text-primary" />
                  </span>
                  Anamnesis del paciente
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Grabación, estructuración y validación de una única ficha vigente.
                </p>
              </div>

              {currentSessionId && (
                <div className="animate-in slide-in-from-right-5 flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Ficha activa:
                    <span className="ml-1 font-mono text-foreground">
                      {currentSessionId.substring(0, 8)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </header>

          <div className="grid grid-cols-1 gap-3 pb-8 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:pb-0">
            <div className="flex min-h-0 flex-col gap-3 lg:col-span-4">
              <SessionPatientCard
                selectedPatient={selectedPatient}
                onPatientSelect={handlePatientSelect}
              />

              <SessionTemplateCard
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                isLoading={isLoadingTemplates}
                isSaving={isSavingTemplate}
                disabled={isTemplateLocked}
                onTemplateChange={(templateId) => void handleTemplateChange(templateId)}
              />

              <SessionRecorder
                onTranscriptionReady={handleTranscriptionReady}
                patientId={selectedPatient?.id || null}
                isPatientSelected={!!selectedPatient}
                plantillaAnamnesisId={selectedTemplateId || null}
                onSessionCreated={handleSessionCreated}
              />
            </div>

            <div className="flex min-h-[600px] flex-col lg:col-span-8 lg:h-full lg:min-h-0">
              <Card className="flex h-full min-h-0 flex-col overflow-hidden bg-card shadow-sm">
                <Tabs defaultValue="anamnesis" className="flex h-full min-h-0 flex-col">

                <CardHeader className="border-b bg-muted/10 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="h-4 w-4 text-primary" />
                        Historia clínica electrónica
                      </CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        Documentación automática estructurada basada en la transcripción.
                      </CardDescription>
                    </div>
                    {recordExists && (
                      <Badge
                        variant="outline"
                        className={
                          recordFinalized
                            ? "w-fit border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "w-fit border-amber-200 bg-amber-50 text-amber-800"
                        }
                      >
                        <Activity className="mr-1 h-3 w-3" />
                        {recordFinalized ? "Ficha guardada" : "Borrador pendiente"}
                      </Badge>
                    )}
                    {isStructuringLive && (
                      <Badge
                        variant="outline"
                        className="w-fit border-sky-200 bg-sky-50 text-sky-800"
                      >
                        <Sparkles className="mr-1 h-3 w-3 animate-pulse" />
                        IA estructurando en vivo
                      </Badge>
                    )}
                    {anamnesisPhase?.estadoAnamnesis &&
                      anamnesisPhase.estadoAnamnesis !== "no_iniciada" && (
                        <Badge
                          variant="outline"
                          className="w-fit border-sky-200 bg-sky-50 text-sky-800"
                          title={anamnesisPhase.motivoCierreAnamnesis || undefined}
                        >
                          <Activity className="mr-1 h-3 w-3" />
                          {anamnesisPhaseLabels[anamnesisPhase.estadoAnamnesis] ||
                            "Fase de anamnesis"}
                          {anamnesisPhase.segmentoFinAnamnesis
                            ? ` · seg. ${anamnesisPhase.segmentoFinAnamnesis}`
                            : ""}
                        </Badge>
                      )}
                  </div>

                  <TabsList className="mt-2 grid h-9 w-full grid-cols-2">
                    <TabsTrigger value="anamnesis" className="gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Anamnesis
                    </TabsTrigger>
                    <TabsTrigger value="transcripcion" className="gap-2">
                      <FileText className="h-4 w-4" />
                      Transcripción en vivo
                      <span className="text-[10px] text-muted-foreground">
                        {transcription.length}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>

                <TabsContent value="anamnesis" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <CardContent className="h-full overflow-y-auto bg-muted/5 p-0">
                    {patientId && currentSessionId ? (
                      <div className="mx-auto w-full max-w-6xl p-3">
                        <div className="rounded-md border bg-background p-1 shadow-sm">
                          <MedicalRecordContainer
                            formData={formData}
                            setFormData={setFormData}
                            transcriptionSnippet={transcriptionSnippet}
                            fullTranscription={fullTranscription}
                            showFullTranscription={showFullTranscription}
                            toggleTranscriptionView={toggleTranscriptionView}
                            handleChange={handleChange}
                            sectionMeta={sectionMeta}
                            modifiedFields={modifiedFields}
                            recordSummary={recordSummary}
                            onRecordSummaryChange={handleRecordSummaryChange}
                            onEssiNoteChange={handleEssiNoteChange}
                            validationWarnings={validationWarnings}
                            editElapsedMs={editElapsedMs}
                            isEditTiming={isEditTiming}
                            validationElapsedMs={validationElapsedMs}
                            isValidationTiming={isValidationTiming}
                            hasValidationStarted={hasValidationStarted}
                            onAcceptSuggestion={handleAcceptSuggestion}
                            onRejectSuggestion={handleRejectSuggestion}
                            onBlockSection={handleBlockSection}
                            onRetrySection={handleRetrySection}
                            onRefineSection={handleRefineSection}
                            isSaving={isSaving}
                            isExporting={isExporting}
                            onClose={() => {}}
                            onSave={async () => {
                              await handleSave();
                            }}
                            onExport={async () => {
                              await handleExportPDF();
                            }}
                            refreshTranscription={refreshTranscription}
                            refreshRecordData={refreshRecordData}
                            patientId={patientId}
                            sessionId={currentSessionId}
                            showCloseButton={false}
                            showTranscriptionPanel={false}
                            templateSections={selectedTemplate?.secciones}
                          />
                        </div>
                      </div>
                    ) : (
                      <EmptyRecordPlaceholder />
                    )}
                  </CardContent>
                </TabsContent>

                <TabsContent value="transcripcion" className="mt-0 min-h-0 flex-1 overflow-hidden bg-muted/5 p-4 sm:p-5">
                  <Transcription transcription={transcription} />
                </TabsContent>
                </Tabs>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
