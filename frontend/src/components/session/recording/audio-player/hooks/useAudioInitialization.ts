
import { useState, useEffect } from "react";
import { preloadAudio } from "@/utils/audio";
import { toast } from "sonner";

export function useAudioInitialization(
  audioURL: string | null,
  audioRef: React.RefObject<HTMLAudioElement>,
  handleTimeUpdate: () => void,
  handleEnded: () => void,
  handleError: (event: Event) => void
) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const audioElement = audioRef.current;
    
    const initializeAudio = async () => {
      setIsLoaded(false);
      
      if (!audioURL) {
        return;
      }
      
      console.log("New audio URL detected:", audioURL);
      
      try {
        // Preload the audio
        const preloadedAudio = await preloadAudio(audioURL);
        
        if (!isMounted) return;
        
        if (preloadedAudio) {
          // Clean up any existing audio element
          if (audioElement) {
            audioElement.pause();
            audioElement.src = "";
            audioElement.load();
            
            // For existing element, we can update its properties
            audioElement.src = audioURL;
            audioElement.preload = "auto";
          } else {
            // If there's no audio element in the ref, we create one
            // but we can't directly assign to audioRef.current as it's read-only
            // Instead we'll need to handle this in the parent component
            console.log("No audio element in ref, parent should handle creation");
          }
          
          // Configure audio element events if it exists
          if (audioElement) {
            audioElement.addEventListener("timeupdate", handleTimeUpdate);
            audioElement.addEventListener("ended", handleEnded);
            audioElement.addEventListener("error", handleError);
            
            setIsLoaded(true);
            console.log("Audio player initialized with URL:", audioURL);
          } else {
            console.error("Audio element not available");
          }
        } else {
          console.error("Failed to preload audio");
          if (isMounted) {
            toast.error("Error al cargar el audio");
          }
        }
      } catch (error) {
        console.error("Error initializing audio:", error);
        if (isMounted) {
          toast.error("Error al inicializar el reproductor de audio");
        }
      }
    };
    
    initializeAudio();
    
    return () => {
      isMounted = false;
      
      // Clean up the audio element
      if (audioElement) {
        audioElement.removeEventListener("timeupdate", handleTimeUpdate);
        audioElement.removeEventListener("ended", handleEnded);
        audioElement.removeEventListener("error", handleError);
        audioElement.pause();
        audioElement.src = "";
        audioElement.load();
      }
    };
  }, [audioRef, audioURL, handleEnded, handleError, handleTimeUpdate]);

  return { isLoaded };
}
