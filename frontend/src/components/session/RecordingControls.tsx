
import { AudioPlayer } from "./recording/AudioPlayer";
import { ControlButtons } from "./recording/ControlButtons";
import { RecordingStatus } from "./recording/RecordingStatus";
import { Waveform } from "./Waveform";

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  isPatientSelected: boolean;
  isTranscribing: boolean;
  audioURL: string | null;
  audioWaveform: number[];
  sessionId: string;
  recordingTime: number;
  permissionDenied: boolean;
  onRequestPermission: () => Promise<boolean>;
  onGenerateSessionId: () => void;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
}

export function RecordingControls({
  isRecording,
  isPaused,
  isPatientSelected,
  isTranscribing,
  audioURL,
  audioWaveform,
  sessionId,
  recordingTime,
  permissionDenied,
  onRequestPermission,
  onGenerateSessionId,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopRecording
}: RecordingControlsProps) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
      <ControlButtons
        isRecording={isRecording}
        isPaused={isPaused}
        isTranscribing={isTranscribing}
        isPatientSelected={isPatientSelected}
        audioURL={audioURL}
        sessionId={sessionId}
        permissionDenied={permissionDenied}
        onRequestPermission={onRequestPermission}
        onGenerateSessionId={onGenerateSessionId}
        onStartRecording={onStartRecording}
        onPauseRecording={onPauseRecording}
        onResumeRecording={onResumeRecording}
        onStopRecording={onStopRecording}
      />
      
      {isRecording && (
        <div className="w-full">
          <RecordingStatus
            isRecording={isRecording}
            isPaused={isPaused}
            isTranscribing={isTranscribing}
            sessionId={sessionId}
            recordingTime={recordingTime}
            audioURL={audioURL}
          />
          <div className="p-2 bg-muted/30 rounded-md">
            <Waveform data={audioWaveform} height={40} isActive={!isPaused} />
          </div>
        </div>
      )}
      
      <AudioPlayer 
        audioURL={audioURL} 
        isVisible={!isRecording && !isTranscribing && !!audioURL} 
      />
      
      {!isRecording && (
        <RecordingStatus
          isRecording={isRecording}
          isPaused={isPaused}
          isTranscribing={isTranscribing}
          sessionId={sessionId}
          recordingTime={recordingTime}
          audioURL={audioURL}
        />
      )}
    </div>
  );
}
