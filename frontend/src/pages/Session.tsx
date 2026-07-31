import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, FileText, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { SessionRecorder } from "@/components/SessionRecorder";
import { Transcription } from "@/components/Transcription";
import { SessionPatientCard } from "@/components/session/SessionPatientCard";
import { EmptyRecordPlaceholder } from "@/components/session/EmptyRecordPlaceholder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MedicalRecordContainer } from "@/components/medical-record-modal/MedicalRecordContainer";
import { Patient } from "@/components/patients/PatientDialogTypes";
import { useMedicalRecord } from "@/hooks/medical-record/use-medical-record";
import { logger } from "@/utils/logger";
import api from "@/lib/api";

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
  const [searchParams] = useSearchParams();
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
    recordSummary,
    validationWarnings,
    handleRecordSummaryChange,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleBlockSection,
    handleRetrySection,
    handleRefineSection,
    recordExists,
    refreshTranscription,
    refreshRecordData,
    editElapsedMs,
    isEditTiming,
  } = useMedicalRecord(currentSessionId, patientId);

  const loadPatient = useCallback(async (id: string) => {
    try {
      const response = await api.get(`/clinical/patients/${id}`);
      const data = response.data;
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
        toast.success(`Paciente ${data.nombre} cargado correctamente`);
      }
    } catch (requestError) {
      logger.error("Error loading patient:", requestError);
      toast.error("Error al cargar el paciente");
    }
  }, []);

  useEffect(() => {
    const id = searchParams.get("patientId");
    if (id) loadPatient(id);
  }, [searchParams, loadPatient]);

  const handleSessionCreated = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    toast.success(`Sesion ${sessionId} iniciada correctamente`);
  }, []);

  const handleTranscriptionReady = useCallback((text: string) => {
    setTranscription(text);
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

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="app-content flex-1 overflow-auto">
        <div className="container mx-auto max-w-[1600px] px-4 py-7 md:px-8 md:py-8">
          <header className="mb-6 rounded-lg border border-border/60 bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  <span className="rounded-xl bg-primary/10 p-2">
                    <Stethoscope className="h-7 w-7 text-primary" />
                  </span>
                  Sesion de consulta
                </h1>
                <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                  Gestion integral de consulta medica asistida por IA.
                </p>
              </div>

              {currentSessionId && (
                <div className="animate-in slide-in-from-right-5 flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-4 py-2">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Sesion activa:
                    <span className="ml-1 font-mono text-foreground">
                      {currentSessionId.substring(0, 8)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 pb-10 xl:grid-cols-12 xl:gap-6">
            <div className="flex flex-col gap-6 xl:col-span-4">
              <SessionPatientCard
                selectedPatient={selectedPatient}
                onPatientSelect={setSelectedPatient}
              />

              <SessionRecorder
                onTranscriptionReady={handleTranscriptionReady}
                patientId={selectedPatient?.id || null}
                isPatientSelected={!!selectedPatient}
                onSessionCreated={handleSessionCreated}
              />
            </div>

            <div className="flex min-h-[600px] flex-col xl:col-span-8 xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)]">
              <Card className="flex h-full min-h-0 flex-col overflow-hidden bg-card shadow-sm">
                <Tabs defaultValue="anamnesis" className="flex h-full min-h-0 flex-col">

                <CardHeader className="border-b bg-muted/10 pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Activity className="h-5 w-5 text-primary" />
                        Historia clinica electronica
                      </CardTitle>
                      <CardDescription>
                        Documentacion automatica estructurada basada en la transcripcion.
                      </CardDescription>
                    </div>
                    {recordExists && (
                      <Badge
                        variant="secondary"
                        className="w-fit border-amber-200 bg-amber-100 text-amber-800"
                      >
                        <Activity className="mr-1 h-3 w-3" />
                        Ficha existente
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

                  <TabsList className="mt-4 grid h-11 w-full grid-cols-2">
                    <TabsTrigger value="anamnesis" className="gap-2">
                      <Stethoscope className="h-4 w-4" />
                      Anamnesis
                    </TabsTrigger>
                    <TabsTrigger value="transcripcion" className="gap-2">
                      <FileText className="h-4 w-4" />
                      Transcripcion en vivo
                      <span className="text-[10px] text-muted-foreground">
                        {transcription.length}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>

                <TabsContent value="anamnesis" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <CardContent className="h-full overflow-y-auto bg-muted/5 p-0">
                    {patientId && currentSessionId ? (
                      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-5">
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
                            recordSummary={recordSummary}
                            onRecordSummaryChange={handleRecordSummaryChange}
                            validationWarnings={validationWarnings}
                            editElapsedMs={editElapsedMs}
                            isEditTiming={isEditTiming}
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
