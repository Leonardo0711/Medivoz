
import { Button } from "@/components/ui/button";
import { Play, Square, Mic, Pause } from "lucide-react";

interface ControlButtonsProps {
  isRecording: boolean;
  isPaused: boolean;
  isTranscribing: boolean;
  isPatientSelected: boolean;
  audioURL: string | null;
  sessionId: string;
  permissionDenied: boolean;
  onRequestPermission: () => Promise<boolean>;
  onGenerateSessionId: () => void;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
}

export function ControlButtons({
  isRecording,
  isPaused,
  isTranscribing,
  isPatientSelected,
  audioURL,
  sessionId,
  permissionDenied,
  onRequestPermission,
  onGenerateSessionId,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopRecording
}: ControlButtonsProps) {
  // Handle permission request
  const handlePermissionRequest = async () => {
    if (await onRequestPermission()) {
      onGenerateSessionId();
    }
  };

  return (
    <div className="flex gap-3 items-center flex-wrap justify-center">
      {!sessionId && isPatientSelected && (
        <Button 
          variant="outline" 
          size="lg"
          className="border-2 border-primary/50 hover:border-primary bg-primary/5 hover:bg-primary/10 text-primary font-semibold px-6 py-6 h-auto transition-all duration-200 hover:scale-105"
          onClick={handlePermissionRequest}
          disabled={permissionDenied}
        >
          <Mic className="mr-2 h-5 w-5" />
          Generar Código de Sesión
        </Button>
      )}
      
      {!isPatientSelected && (
        <Button
          variant="outline"
          size="lg"
          disabled
        >
          Seleccione un paciente primero
        </Button>
      )}
      
      {sessionId && !isRecording && !isTranscribing && !audioURL && (
        <Button
          variant="default"
          size="lg"
          className="relative bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground font-semibold text-base px-8 py-6 h-auto shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 hover:scale-105 active:scale-95 rounded-xl"
          onClick={onStartRecording}
          disabled={permissionDenied}
        >
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 opacity-0 hover:opacity-100 transition-opacity duration-300" />
          <Play className="mr-3 h-6 w-6 relative z-10" />
          <span className="relative z-10">Iniciar Grabación</span>
        </Button>
      )}
      
      {isRecording && !isPaused && (
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={onPauseRecording}
            className="border-amber-500 text-amber-500 hover:bg-amber-50"
          >
            <Pause className="mr-2 h-4 w-4" />
            Pausar Grabación
          </Button>
          
          <Button
            variant="destructive"
            size="lg"
            onClick={onStopRecording}
          >
            <Square className="mr-2 h-4 w-4" />
            Detener Grabación
          </Button>
        </>
      )}
      
      {isRecording && isPaused && (
        <>
          <Button
            variant="default"
            size="lg"
            className="relative bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground font-semibold text-base px-8 py-6 h-auto shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 hover:scale-105 active:scale-95 rounded-xl"
            onClick={onResumeRecording}
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 opacity-0 hover:opacity-100 transition-opacity duration-300" />
            <Play className="mr-3 h-6 w-6 relative z-10" />
            <span className="relative z-10">Reanudar Grabación</span>
          </Button>
          
          <Button
            variant="destructive"
            size="lg"
            onClick={onStopRecording}
          >
            <Square className="mr-2 h-4 w-4" />
            Detener Grabación
          </Button>
        </>
      )}
    </div>
  );
}
