import { Button } from "@/components/ui/button";
import { Pause, Play, Square } from "lucide-react";

interface ControlButtonsProps {
  isRecording: boolean;
  isPaused: boolean;
  isTranscribing: boolean;
  isPatientSelected: boolean;
  audioURL: string | null;
  permissionDenied: boolean;
  onStartRecording: () => Promise<void>;
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
  permissionDenied,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
}: ControlButtonsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {!isPatientSelected && (
        <Button variant="outline" size="lg" disabled>
          Selecciona un paciente primero
        </Button>
      )}

      {isPatientSelected && !isRecording && !isTranscribing && !audioURL && (
        <Button
          variant="default"
          size="lg"
          className="h-auto rounded-xl bg-gradient-to-r from-primary to-secondary px-8 py-6 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300 hover:scale-105 hover:from-primary/90 hover:to-secondary/90 hover:shadow-xl hover:shadow-primary/40 active:scale-95"
          onClick={onStartRecording}
          disabled={permissionDenied}
        >
          <Play className="mr-3 h-6 w-6" />
          Iniciar grabacion
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
            Pausar grabacion
          </Button>
          <Button variant="destructive" size="lg" onClick={onStopRecording}>
            <Square className="mr-2 h-4 w-4" />
            Detener grabacion
          </Button>
        </>
      )}

      {isRecording && isPaused && (
        <>
          <Button
            variant="default"
            size="lg"
            className="h-auto rounded-xl bg-gradient-to-r from-primary to-secondary px-8 py-6 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300 hover:scale-105 hover:from-primary/90 hover:to-secondary/90 hover:shadow-xl hover:shadow-primary/40 active:scale-95"
            onClick={onResumeRecording}
          >
            <Play className="mr-3 h-6 w-6" />
            Reanudar grabacion
          </Button>
          <Button variant="destructive" size="lg" onClick={onStopRecording}>
            <Square className="mr-2 h-4 w-4" />
            Detener grabacion
          </Button>
        </>
      )}
    </div>
  );
}
