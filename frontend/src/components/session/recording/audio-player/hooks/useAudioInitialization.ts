
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
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = "";
            audioRef.current.load();
            
            // For existing element, we can update its properties
            audioRef.current.src = audioURL;
            audioRef.current.preload = "auto";
          } else {
            // If there's no audio element in the ref, we create one
            // but we can't directly assign to audioRef.current as it's read-only
            // Instead we'll need to handle this in the parent component
            console.log("No audio element in ref, parent should handle creation");
          }
          
          // Configure audio element events if it exists
          if (audioRef.current) {
            audioRef.current.addEventListener("timeupdate", handleTimeUpdate);
            audioRef.current.addEventListener("ended", handleEnded);
            audioRef.current.addEventListener("error", handleError);
            
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
      if (audioRef.current) {
        audioRef.current.removeEventListener("timeupdate", handleTimeUpdate);
        audioRef.current.removeEventListener("ended", handleEnded);
        audioRef.current.removeEventListener("error", handleError);
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
      }
    };
  }, [audioURL]);

  return { isLoaded };
}
