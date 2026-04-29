
import { Mic, Pause, Loader2, MicOff, CheckCircle } from "lucide-react";

interface RecordingStatusProps {
  isRecording: boolean;
  isPaused: boolean;
  isTranscribing: boolean;
  sessionId: string;
  recordingTime: number;
  audioURL: string | null;
}

export function RecordingStatus({
  isRecording,
  isPaused,
  isTranscribing,
  sessionId,
  recordingTime,
  audioURL
}: RecordingStatusProps) {
  const formatTime = (seconds: number) => {
    if (seconds === undefined || seconds === null || isNaN(seconds) || !isFinite(seconds)) {
      return "00:00";
    }
    const mins = Math.floor(Math.max(0, seconds) / 60);
    const secs = Math.floor(Math.max(0, seconds) % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 mb-2 py-2 px-3 rounded-md bg-opacity-10">
        {isPaused ? (
          <div className="flex items-center gap-2 text-amber-500 bg-amber-100/50 w-full justify-center py-1 rounded-md">
            <Pause className="h-5 w-5" />
            <span className="font-medium">
              Grabación pausada: {formatTime(recordingTime)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-500 bg-red-100/50 w-full justify-center py-1 rounded-md">
            <Mic className="h-5 w-5 animate-pulse" />
            <span className="font-medium">
              Grabando: {formatTime(recordingTime)}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (isTranscribing) {
    return (
      <div className="flex items-center gap-2 text-amber-500 bg-amber-100/50 w-full justify-center py-2 px-3 rounded-md">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-medium">Transcribiendo audio...</span>
      </div>
    );
  }

  if (sessionId && !isRecording && !isTranscribing && audioURL) {
    return (
      <div className="flex items-center gap-2 text-green-500 bg-green-100/50 w-full justify-center py-2 px-3 rounded-md">
        <CheckCircle className="h-5 w-5" />
        <span className="font-medium">Audio grabado correctamente</span>
      </div>
    );
  }

  if (sessionId && !isRecording && !isTranscribing) {
    return (
      <div className="flex items-center gap-2 text-primary bg-primary/10 w-full justify-center py-2 px-3 rounded-md">
        <MicOff className="h-5 w-5" />
        <span className="font-medium">Listo para grabar</span>
      </div>
    );
  }

  return null;
}
