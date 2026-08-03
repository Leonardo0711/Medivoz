import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MedicalRecordContainer } from "./MedicalRecordContainer";
import { PatientInfoCard } from "../medical-record/PatientInfoCard";
import { useMedicalRecord } from "@/hooks/medical-record/use-medical-record";
import { FileText, Stethoscope } from "lucide-react";

interface MedicalRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId?: string | null;
  sessionId?: string | null;
}

export function MedicalRecordModal({
  open,
  onOpenChange,
  patientId,
  sessionId,
}: MedicalRecordModalProps) {
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
    recordSummary,
    handleRecordSummaryChange,
    handleEssiNoteChange,
    sectionMeta,
    modifiedFields,
    validationWarnings,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleBlockSection,
    handleRetrySection,
    handleRefineSection,
    refreshTranscription,
    refreshRecordData,
    editElapsedMs,
    isEditTiming,
  } = useMedicalRecord(sessionId || null, patientId || null);

  const handleSaveAndClose = async () => {
    if (!patientId || !sessionId) {
      return;
    }

    const success = await handleSave();
    if (success) {
      onOpenChange(false);
    }
  };

  const handleExportPDFClick = async () => {
    if (!patientId || !sessionId) {
      return;
    }

    await handleExportPDF();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[calc(100vw-1.5rem)] max-w-[1280px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-primary">
              <Stethoscope className="h-5 w-5" />
              Ficha médica
            </DialogTitle>
            <Badge variant="outline" className="bg-primary/10 text-xs text-primary">
              Sesión: {sessionId?.substring(0, 8) || "Nueva"}
            </Badge>
          </div>
          <DialogDescription className="text-sm">
            Revisa la anamnesis y consulta la transcripción sin perder espacio de trabajo.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="ficha" className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b bg-muted/20 px-5 py-3">
            <TabsList className="grid h-9 w-full max-w-md grid-cols-2">
              <TabsTrigger value="ficha" className="gap-2">
                <Stethoscope className="h-4 w-4" />
                Ficha
              </TabsTrigger>
              <TabsTrigger value="transcripcion" className="gap-2">
                <FileText className="h-4 w-4" />
                Transcripción
                <span className="text-[10px] text-muted-foreground">
                  {fullTranscription.length.toLocaleString()}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ficha" className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {patientData && (
              <div className="pt-4">
                <PatientInfoCard name={patientData.nombre} age={patientData.edad} />
              </div>
            )}

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
              onAcceptSuggestion={handleAcceptSuggestion}
              onRejectSuggestion={handleRejectSuggestion}
              onBlockSection={handleBlockSection}
              onRetrySection={handleRetrySection}
              onRefineSection={handleRefineSection}
              isSaving={isSaving}
              isExporting={isExporting}
              onClose={() => onOpenChange(false)}
              onSave={handleSaveAndClose}
              onExport={handleExportPDFClick}
              refreshTranscription={refreshTranscription}
              refreshRecordData={refreshRecordData}
              patientId={patientId}
              sessionId={sessionId}
              showTranscriptionPanel={false}
              showTranscriptionSummary={false}
            />
          </TabsContent>

          <TabsContent
            value="transcripcion"
            className="mt-0 min-h-0 flex-1 overflow-y-auto bg-muted/10 p-5"
          >
            <div className="mx-auto max-w-4xl rounded-md border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-primary" />
                    Transcripción completa
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Texto registrado durante esta consulta.
                  </p>
                </div>
                <Badge variant="outline">{fullTranscription.length.toLocaleString()} caracteres</Badge>
              </div>
              <div className="min-h-64 whitespace-pre-wrap break-words p-4 text-sm leading-6 text-foreground">
                {fullTranscription || "Esta consulta no tiene transcripción disponible."}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
