
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { getBestSupportedMimeType, revokeBlobURL } from "@/utils/audio";
import { logger } from "@/utils/logger";
import { 
  createAudioBlobFromChunks, 
  stopMediaStreamTracks,
  createMediaRecorder,
  updateAudioURL
} from "@/utils/audio/recording-utils";

export function useAudioRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>('');
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      revokeBlobURL(audioURL);
      stopMediaStreamTracks(streamRef.current);
      streamRef.current = null;
    };
  }, [audioURL]);
  
  const getAudioBlob = (): Blob | null => {
    return audioBlobRef.current || createAudioBlobFromChunks(audioChunksRef.current, mimeTypeRef.current);
  };

  const handleDataAvailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      audioChunksRef.current.push(event.data);
      logger.log(`Audio chunk received: ${event.data.size} bytes, type: ${event.data.type}`);
    }
  };
  
  const handleRecorderStop = () => {
    const audioBlob = createAudioBlobFromChunks(audioChunksRef.current, mimeTypeRef.current);
    audioBlobRef.current = audioBlob;
    const newUrl = updateAudioURL(audioURL, audioBlob);
    setAudioURL(newUrl);
  };

  const startRecording = async (stream: MediaStream) => {
    try {
      streamRef.current = stream;
      
      audioChunksRef.current = [];
      audioBlobRef.current = null;
      const newUrl = updateAudioURL(audioURL, null);
      setAudioURL(newUrl);
      
      mimeTypeRef.current = getBestSupportedMimeType();
      
      mediaRecorderRef.current = createMediaRecorder(
        stream, 
        mimeTypeRef.current, 
        handleDataAvailable
      );
      
      if (!mediaRecorderRef.current) {
        throw new Error("Failed to create MediaRecorder");
      }
      
      mediaRecorderRef.current.onstop = handleRecorderStop;
      
      mediaRecorderRef.current.start(100);
      setIsRecording(true);
      setIsPaused(false);
      
    } catch (error) {
      logger.error("Error starting recording:", error);
      toast.error("Error al iniciar la grabación");
    }
  };

  const pauseRecording = () => {
    logger.log("Attempting to pause recording. State:", mediaRecorderRef.current?.state);
    
    if (!isRecording || !mediaRecorderRef.current) {
      logger.log("Cannot pause - not recording or no media recorder");
      return;
    }
    
    try {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        logger.log("Recording paused successfully");
      } else {
        logger.log("Cannot pause - current state:", mediaRecorderRef.current.state);
      }
    } catch (error) {
      logger.error("Error pausing recording:", error);
      toast.error("Error al pausar la grabación");
    }
  };

  const resumeRecording = () => {
    logger.log("Attempting to resume recording. State:", mediaRecorderRef.current?.state);
    
    if (!isRecording || !mediaRecorderRef.current || !isPaused) {
      logger.log("Cannot resume - not recording, no media recorder, or not paused");
      return;
    }
    
    try {
      if (mediaRecorderRef.current.state === "paused") {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        logger.log("Recording resumed successfully");
      } else {
        logger.log("Cannot resume - current state:", mediaRecorderRef.current.state);
      }
    } catch (error) {
      logger.error("Error resuming recording:", error);
      toast.error("Error al reanudar la grabación");
    }
  };

  const stopRecording = async () => {
    logger.log("Attempting to stop recording. State:", mediaRecorderRef.current?.state);
    
    if (!isRecording || !mediaRecorderRef.current) {
      logger.log("Cannot stop - not recording or no media recorder");
      return;
    }
    
    try {
      mediaRecorderRef.current.requestData();
      
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        logger.log("Recording stopped successfully");
      }
      
      stopMediaStreamTracks(streamRef.current);
      streamRef.current = null;
      
      setIsRecording(false);
      setIsPaused(false);

      if (!audioBlobRef.current) {
        const audioBlob = createAudioBlobFromChunks(audioChunksRef.current, mimeTypeRef.current);
        audioBlobRef.current = audioBlob;
        const newUrl = updateAudioURL(audioURL, audioBlob);
        setAudioURL(newUrl);
      }
    } catch (error) {
      logger.error("Error stopping recording:", error);
      toast.error("Error al detener la grabación");
    }
  };

  return {
    isRecording,
    isPaused,
    audioURL,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    getAudioBlob
  };
}
