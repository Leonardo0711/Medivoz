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
  onStartRecording: () => Promise<void>;
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
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
}: RecordingControlsProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
      <ControlButtons
        isRecording={isRecording}
        isPaused={isPaused}
        isTranscribing={isTranscribing}
        isPatientSelected={isPatientSelected}
        audioURL={audioURL}
        permissionDenied={permissionDenied}
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
          <div className="rounded-md bg-muted/30 p-2">
            <Waveform data={audioWaveform} height={40} isActive={!isPaused} />
          </div>
        </div>
      )}

      <AudioPlayer audioURL={audioURL} isVisible={!isRecording && !isTranscribing && !!audioURL} />

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
