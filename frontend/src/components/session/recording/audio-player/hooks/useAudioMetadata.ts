
import { useCallback, useEffect, useState } from "react";
import { forceLoadMetadata } from "@/utils/audio";

export function useAudioMetadata(audioRef: React.RefObject<HTMLAudioElement>) {
  const [duration, setDuration] = useState(0);
  
  const handleLoadedMetadata = useCallback(() => {
    const audioElement = audioRef.current;
    if (audioElement) {
      const audioDuration = audioElement.duration;
      console.log("Audio metadata loaded, duration:", audioDuration);
      
      if (isNaN(audioDuration) || !isFinite(audioDuration)) {
        console.warn("Invalid audio duration:", audioDuration);
        setDuration(0);
      } else {
        setDuration(audioDuration);
      }
    }
  }, [audioRef]);

  const handleCanPlay = useCallback(() => {
    const audioElement = audioRef.current;
    console.log("Audio can play now, duration:", audioElement?.duration);
    if (audioElement && !isNaN(audioElement.duration) && isFinite(audioElement.duration)) {
      setDuration(audioElement.duration);
    }
  }, [audioRef]);

  // Listen for metadata events
  useEffect(() => {
    const audioElement = audioRef.current;
    
    if (audioElement) {
      audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.addEventListener("canplay", handleCanPlay);
      
      // Only force load metadata if there's a valid source
      if (audioElement.src && audioElement.src !== window.location.href) {
        forceLoadMetadata(audioElement).catch(error => 
          console.warn("Error loading metadata:", error)
        );
      }
    }
    
    return () => {
      if (audioElement) {
        audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audioElement.removeEventListener("canplay", handleCanPlay);
      }
    };
  }, [audioRef, handleCanPlay, handleLoadedMetadata]);

  return { duration };
}
