
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

export function useAudioPlayback(_audioURL: string | null) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  // Initialize audio element when component mounts
  useEffect(() => {
    if (!audioRef.current && typeof Audio !== 'undefined') {
      audioRef.current = new Audio();
    }
    
    return () => {
      // Cleanup handled in useAudioCleanup
    };
  }, []);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    console.log("Audio playback ended");
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) {
      toast.error("Audio no está listo para reproducirse");
      return;
    }
    
    if (isPlaying) {
      // If currently playing, pause the audio
      if (playPromiseRef.current) {
        playPromiseRef.current
          .then(() => {
            if (audioRef.current) {
              audioRef.current.pause();
              setIsPlaying(false);
            }
          })
          .catch(error => {
            console.error("Error with play promise during pause:", error);
          });
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      try {
        // Store the play promise
        console.log("Attempting to play audio...");
        audioRef.current.currentTime = currentTime;
        playPromiseRef.current = audioRef.current.play();
        
        // Only set the state to playing after the promise resolves
        if (playPromiseRef.current) {
          playPromiseRef.current
            .then(() => {
              console.log("Audio playback started successfully");
              setIsPlaying(true);
              playPromiseRef.current = null;
            })
            .catch(error => {
              console.error("Error playing audio:", error);
              toast.error("Error al reproducir el audio. Por favor, intente de nuevo.");
              setIsPlaying(false);
              playPromiseRef.current = null;
            });
        }
      } catch (error) {
        console.error("Exception during play:", error);
        toast.error("Error al reproducir el audio. Por favor, intente de nuevo.");
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current && !isNaN(newTime)) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  return {
    isPlaying,
    currentTime,
    audioRef,
    playPromiseRef,
    handleTimeUpdate,
    handleEnded,
    handlePlayPause,
    handleSeek
  };
}
