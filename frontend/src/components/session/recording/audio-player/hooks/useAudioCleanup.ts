
import { useCallback, useEffect } from "react";
import { revokeBlobURL } from "@/utils/audio";

export function useAudioCleanup(
  audioURL: string | null,
  audioRef: React.RefObject<HTMLAudioElement>,
  playPromiseRef: React.RefObject<Promise<void> | null>
) {
  const cleanup = useCallback(() => {
    if (audioURL?.startsWith("blob:")) {
      revokeBlobURL(audioURL);
    }

    const audioElement = audioRef.current;
    if (!audioElement) return;

    const resetAudio = () => {
      audioElement.pause();
      audioElement.src = "";
      audioElement.load();
    };

    try {
      if (playPromiseRef.current) {
        void playPromiseRef.current.then(resetAudio, resetAudio);
      } else {
        resetAudio();
      }
    } catch (error) {
      console.error("Error cleaning up audio:", error);
    }
  }, [audioRef, audioURL, playPromiseRef]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Also clean up when audioURL changes
  useEffect(() => {
    // No need to clean up when a new URL is set - that's handled in initialization
    // This is just to revoke the old URL
    if (audioURL === null) {
      cleanup();
    }
  }, [audioURL, cleanup]);

  return { cleanup };
}
