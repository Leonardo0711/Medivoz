
import { useEffect } from "react";
import { revokeBlobURL } from "@/utils/audio";

export function useAudioCleanup(
  audioURL: string | null,
  audioRef: React.RefObject<HTMLAudioElement>,
  playPromiseRef: React.RefObject<Promise<void> | null>
) {
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  // Also clean up when audioURL changes
  useEffect(() => {
    // No need to clean up when a new URL is set - that's handled in initialization
    // This is just to revoke the old URL
    if (audioURL === null) {
      cleanup();
    }
  }, [audioURL]);

  const cleanup = () => {
    // Only revoke blob URL when it's actually a blob URL
    if (audioURL && audioURL.startsWith('blob:')) {
      revokeBlobURL(audioURL);
    }
    
    if (audioRef.current) {
      try {
        // Properly handle play promise before pausing
        if (playPromiseRef.current) {
          playPromiseRef.current
            .then(() => {
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = "";
                audioRef.current.load();
              }
            })
            .catch(() => {
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = "";
                audioRef.current.load();
              }
            });
        } else {
          audioRef.current.pause();
          audioRef.current.src = "";
          audioRef.current.load();
        }
      } catch (e) {
        console.error("Error cleaning up audio:", e);
      }
    }
  };

  return { cleanup };
}
