
import { handleAudioError } from "./utils/errorHandlers";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useAudioMetadata } from "./hooks/useAudioMetadata";
import { useAudioInitialization } from "./hooks/useAudioInitialization";
import { useAudioCleanup } from "./hooks/useAudioCleanup";

export function useAudioPlayer(audioURL: string | null) {
  // Use the individual hooks for specific functionality
  const {
    isPlaying,
    currentTime,
    audioRef,
    playPromiseRef,
    handleTimeUpdate,
    handleEnded,
    handlePlayPause,
    handleSeek
  } = useAudioPlayback(audioURL);
  
  // Get duration from metadata
  const { duration } = useAudioMetadata(audioRef);
  
  // Handle audio initialization
  const { isLoaded } = useAudioInitialization(
    audioURL,
    audioRef,
    handleTimeUpdate,
    handleEnded,
    handleAudioError
  );
  
  // Handle cleanup
  useAudioCleanup(audioURL, audioRef, playPromiseRef);
  
  return {
    isPlaying,
    currentTime,
    duration,
    isLoaded,
    handlePlayPause,
    handleSeek
  };
}
