import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMedicalRecordAutoFill } from "@/hooks/medical-record-auto-fill";
import { TranscriptionPanel } from "./TranscriptionPanel";
import { MedicalRecordForm } from "../medical-record/MedicalRecordForm";
import { MedicalRecordActions } from "../medical-record/MedicalRecordActions";
import { MedicalRecordFormData } from "@/hooks/medical-record/types";
import { logger } from "@/utils/logger";

interface MedicalRecordContainerProps {
  formData: MedicalRecordFormData;
  setFormData: (data: MedicalRecordFormData) => void;
  transcriptionSnippet: string;
  fullTranscription: string;
  showFullTranscription: boolean;
  toggleTranscriptionView: () => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  isSaving: boolean;
  isExporting: boolean;
  onClose?: () => void;
  onSave: () => Promise<void>;
  onExport: () => Promise<void>;
  refreshTranscription: () => Promise<string>;
  patientId?: string | null;
  sessionId?: string | null;
  showCloseButton?: boolean;
}

export const MedicalRecordContainer = memo(function MedicalRecordContainer({
  formData,
  setFormData,
  transcriptionSnippet,
  fullTranscription,
  showFullTranscription,
  toggleTranscriptionView,
  handleChange,
  isSaving,
  isExporting,
  onClose,
  onSave,
  onExport,
  refreshTranscription,
  patientId,
  sessionId,
  showCloseButton = true
}: MedicalRecordContainerProps) {
  const [autoFilledOnce, setAutoFilledOnce] = useState(false);
  const autoFillAttempted = useRef(false);
  const autoFillTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptionChecks = useRef<number>(0);
  const maxTranscriptionChecks = 5; // Maximum number of retries

  const {
    isAutoFilling,
    autoFillMedicalRecord
  } = useMedicalRecordAutoFill();

  const handleAutoFill = useCallback(async () => {
    if (!fullTranscription) {
      toast.error("No hay transcripción para analizar");
      return;
    }
    
    if (isAutoFilling) {
      toast.info("Espere mientras se completa el análisis actual");
      return;
    }
    
    logger.log("Manual auto-fill triggered with transcription length:", fullTranscription.length);
    const medicalRecordData = await autoFillMedicalRecord(fullTranscription);
    
    if (medicalRecordData) {
      setFormData(medicalRecordData);
      setAutoFilledOnce(true);
      toast.success("Ficha médica auto-rellenada exitosamente");
    }
  }, [autoFillMedicalRecord, fullTranscription, isAutoFilling, setFormData]);

  // Check if transcription is available, and if not, retry a few times
  const checkAndAutoFillWithRetry = useCallback(async () => {
    logger.log("Checking transcription availability", { 
      attempt: transcriptionChecks.current + 1, 
      hasTranscription: !!fullTranscription,
      transcriptionLength: fullTranscription?.length || 0
    });
    
    if (fullTranscription && fullTranscription.length > 50) {
      logger.log("Transcription found, proceeding with auto-fill");
      await handleAutoFill();
      return true;
    } else if (transcriptionChecks.current < maxTranscriptionChecks) {
      logger.log("Transcription not available yet, refreshing and retrying...");
      transcriptionChecks.current += 1;
      
      // Try to refresh the transcription data
      const refreshedTranscription = await refreshTranscription();
      logger.log("Refreshed transcription, length:", refreshedTranscription?.length || 0);
      
      // If we got a valid transcription from refresh, use it directly
      if (refreshedTranscription && refreshedTranscription.length > 50) {
        logger.log("Got valid transcription from refresh, proceeding with auto-fill");
        const medicalRecordData = await autoFillMedicalRecord(refreshedTranscription);
        if (medicalRecordData) {
          setFormData(medicalRecordData);
          setAutoFilledOnce(true);
          toast.success("Ficha médica auto-rellenada exitosamente");
        }
        return true;
      }
      
      // Schedule next check
      return new Promise<boolean>(resolve => {
        autoFillTimeoutRef.current = setTimeout(async () => {
          const result = await checkAndAutoFillWithRetry();
          resolve(result);
        }, 2000); // Retry after 2 seconds
      });
    } else {
      // Just log, don't show warning toast - transcription might still arrive and user can trigger manually
      logger.log("Transcription not available after maximum retries, user can trigger manually");
      return false;
    }
  }, [fullTranscription, handleAutoFill, refreshTranscription, autoFillMedicalRecord, setFormData]);

  // Track sessionId and transcription to detect when they change
  const previousSessionIdRef = useRef<string | null>(null);
  const previousTranscriptionRef = useRef<string>("");
  
  // Reset auto-fill state when session changes
  useEffect(() => {
    if (!sessionId) return;
    
    const sessionChanged = previousSessionIdRef.current !== sessionId;
    if (sessionChanged) {
      logger.log("Session changed, resetting auto-fill state");
      autoFillAttempted.current = false;
      transcriptionChecks.current = 0;
      previousSessionIdRef.current = sessionId;
      previousTranscriptionRef.current = "";
    }
  }, [sessionId]);
  
  // Auto-trigger the auto-fill when transcription becomes available (AUTOMATIC)
  useEffect(() => {
    if (!sessionId || !patientId) {
      return;
    }

    // Check if transcription has actually changed and is valid
    const transcriptionChanged = previousTranscriptionRef.current !== fullTranscription;
    const hasValidTranscription = fullTranscription && fullTranscription.length > 50;
    const formIsEmpty = !formData.motivo_consulta;

    // Auto-fill should trigger when:
    // 1. We have a valid transcription that changed
    // 2. Form is empty (no motivo_consulta)
    // 3. We haven't already auto-filled for this transcription
    if (transcriptionChanged && hasValidTranscription && formIsEmpty && !autoFilledOnce) {
      logger.log("Auto-filling medical record automatically - transcription received", {
        transcriptionLength: fullTranscription.length,
        sessionId,
        previousLength: previousTranscriptionRef.current.length
      });
      
      // Update ref to track this transcription
      previousTranscriptionRef.current = fullTranscription;
      
      // Mark that we've attempted auto-fill for this transcription
      autoFillAttempted.current = true;
      
      // Clear any existing timeout
      if (autoFillTimeoutRef.current) {
        clearTimeout(autoFillTimeoutRef.current);
      }
      
      // Small delay to ensure everything is ready, then auto-fill
      autoFillTimeoutRef.current = setTimeout(async () => {
        try {
          const medicalRecordData = await autoFillMedicalRecord(fullTranscription);
          if (medicalRecordData) {
            setFormData(medicalRecordData);
            setAutoFilledOnce(true);
            toast.success("Ficha médica auto-rellenada automáticamente");
          } else {
            // If auto-fill failed, reset so user can try manually
            autoFillAttempted.current = false;
          }
        } catch (error) {
          logger.error("Error in automatic auto-fill:", error);
          // Reset so user can try manually if auto-fill fails
          autoFillAttempted.current = false;
        }
      }, 800); // Reduced delay for faster auto-fill
    }
    
    // Clean up timeout when component unmounts
    return () => {
      if (autoFillTimeoutRef.current) {
        clearTimeout(autoFillTimeoutRef.current);
        autoFillTimeoutRef.current = null;
      }
    };
  }, [fullTranscription, sessionId, patientId, formData.motivo_consulta, autoFilledOnce, autoFillMedicalRecord, setFormData]);

  return (
    <>
      <TranscriptionPanel 
        transcriptionSnippet={transcriptionSnippet}
        fullTranscription={fullTranscription}
        showFullTranscription={showFullTranscription}
        onToggleTranscription={toggleTranscriptionView}
        onAutoFill={handleAutoFill}
        isAutoFilling={isAutoFilling}
      />

      <div className="grid grid-cols-1 gap-6 py-4 mt-2">
        <MedicalRecordForm formData={formData} onChange={handleChange} />
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-2 mt-4">
        <MedicalRecordActions
          isSaving={isSaving}
          isExporting={isExporting}
          onClose={onClose}
          onSave={onSave}
          onExport={onExport}
          showCloseButton={showCloseButton}
        />
      </div>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if critical props have changed
  return (
    prevProps.formData === nextProps.formData &&
    prevProps.transcriptionSnippet === nextProps.transcriptionSnippet &&
    prevProps.fullTranscription === nextProps.fullTranscription &&
    prevProps.showFullTranscription === nextProps.showFullTranscription &&
    prevProps.isSaving === nextProps.isSaving &&
    prevProps.isExporting === nextProps.isExporting &&
    prevProps.patientId === nextProps.patientId &&
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.showCloseButton === nextProps.showCloseButton
    // Note: Callbacks (handleChange, toggleTranscriptionView, onSave, onExport, etc.)
    // should be memoized with useCallback in parent component
  );
});
