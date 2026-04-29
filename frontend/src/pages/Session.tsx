import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PatientInfoCard } from "@/components/medical-record/PatientInfoCard";
import { MedicalRecordContainer } from "@/components/medical-record-modal/MedicalRecordContainer";
import { Patient } from "@/components/patients/PatientDialogTypes";
import { useMedicalRecord } from "@/hooks/medical-record/use-medical-record";
import { logger } from "@/utils/logger";
import api from "@/lib/api";

export default function Session() {
  const [transcription, setTranscription] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const patientId = selectedPatient?.id || null;

  const {
    formData,
    patientData,
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
    recordExists,
    refreshTranscription,
  } = useMedicalRecord(currentSessionId, patientId);

  const loadPatient = useCallback(async (id: string) => {
    try {
      const response = await api.get(`/clinical/patients/${id}`);
      const data = response.data;
      if (data) {
        setSelectedPatient({
          id: data.id,
          nombre: data.nombre,
          dni: data.dni,
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

  useEffect(() => {
    if (transcription && currentSessionId) {
      const timeoutId = setTimeout(async () => {
        logger.log("Refreshing transcription from DB for session:", currentSessionId);
        await refreshTranscription();
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [transcription, currentSessionId, refreshTranscription]);

  const patientInfoProps = useMemo(() => {
    const patient = patientData || selectedPatient;
    if (!patient) return null;

    return {
      name: patient.nombre || "",
      age: patient.edad ?? null,
      occupation: patient.ocupacion ?? null,
      location: patient.procedencia ?? null,
    };
  }, [patientData, selectedPatient]);

  return (
    <div className="flex min-h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="app-content flex-1 overflow-auto">
        <div className="container mx-auto max-w-[1600px] px-4 py-7 md:px-8 md:py-8">
          <header className="mb-7 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm sm:p-6">
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
                    <span className="ml-1 font-mono text-foreground">{currentSessionId.substring(0, 8)}</span>
                  </span>
                </div>
              )}
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 pb-10 xl:grid-cols-12 xl:gap-8">
            <div className="flex flex-col gap-6 xl:col-span-5 xl:gap-8">
              <SessionPatientCard selectedPatient={selectedPatient} onPatientSelect={setSelectedPatient} />

              <div className="space-y-6">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary to-secondary opacity-20 blur" />
                  <SessionRecorder
                    onTranscriptionReady={handleTranscriptionReady}
                    patientId={selectedPatient?.id || null}
                    isPatientSelected={!!selectedPatient}
                    onSessionCreated={handleSessionCreated}
                  />
                </div>

                <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b bg-muted/30 p-4">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Transcripcion en vivo
                    </h3>
                    {transcription && (
                      <Badge variant="outline" className="bg-background text-[10px] uppercase">
                        Procesado
                      </Badge>
                    )}
                  </div>
                  <div className="relative flex-1">
                    <Transcription transcription={transcription} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-[600px] flex-col xl:col-span-7">
              <Card className="relative flex h-full flex-col overflow-hidden border-none bg-card shadow-lg">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary opacity-50" />

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
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto bg-muted/5 p-0">
                  {patientId && currentSessionId ? (
                    <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
                      {patientInfoProps && (
                        <div className="mb-6">
                          <PatientInfoCard
                            name={patientInfoProps.name}
                            age={patientInfoProps.age}
                            occupation={patientInfoProps.occupation}
                            location={patientInfoProps.location}
                          />
                        </div>
                      )}

                      <div className="rounded-xl border bg-background p-1 shadow-sm">
                        <MedicalRecordContainer
                          formData={formData}
                          setFormData={setFormData}
                          transcriptionSnippet={transcriptionSnippet}
                          fullTranscription={fullTranscription}
                          showFullTranscription={showFullTranscription}
                          toggleTranscriptionView={toggleTranscriptionView}
                          handleChange={handleChange}
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
                          patientId={patientId}
                          sessionId={currentSessionId}
                          showCloseButton={false}
                        />
                      </div>
                    </div>
                  ) : (
                    <EmptyRecordPlaceholder />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
