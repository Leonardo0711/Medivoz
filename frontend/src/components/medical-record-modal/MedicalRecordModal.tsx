
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MedicalRecordContainer } from "./MedicalRecordContainer";
import { PatientInfoCard } from "../medical-record/PatientInfoCard";
import { useMedicalRecord } from "@/hooks/medical-record/use-medical-record";

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
  sessionId 
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
    recordExists,
    refreshTranscription
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
        <DialogHeader className="mb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl md:text-2xl text-primary">Ficha Médica</DialogTitle>
            <Badge variant="outline" className="bg-primary/10 text-primary text-xs">
              Sesión: {sessionId?.substring(0, 8) || "Nueva"}
            </Badge>
          </div>
          <DialogDescription className="text-sm md:text-base">
            Información extraída automáticamente de la transcripción
          </DialogDescription>
        </DialogHeader>

        {patientData && (
          <PatientInfoCard 
            name={patientData.nombre} 
            age={patientData.edad} 
            occupation={patientData.ocupacion} 
            location={patientData.procedencia} 
          />
        )}

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
          onClose={() => onOpenChange(false)}
          onSave={handleSaveAndClose}
          onExport={handleExportPDFClick}
          refreshTranscription={refreshTranscription}
          patientId={patientId}
          sessionId={sessionId}
        />
      </DialogContent>
    </Dialog>
  );
}
