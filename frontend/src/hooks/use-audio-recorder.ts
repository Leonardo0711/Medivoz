
import { useState, useRef } from "react";
import { useAudioWaveform } from "./use-audio-waveform";
import { useAudioTranscription } from "./use-audio-transcription";
import { useAudioPermissions } from "./use-audio-permissions";
import { useAudioRecording } from "./use-audio-recording";
import { logger } from "@/utils/logger";

interface AudioRecorderOptions {
  onTranscriptionComplete?: (transcription: string) => void;
}

export function useAudioRecorder(options?: AudioRecorderOptions) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const audioProcessingRef = useRef(false);
  
  const { 
    permissionDenied,
    requestPermission 
  } = useAudioPermissions();
  
  const {
    isRecording,
    isPaused,
    audioURL,
    startRecording: startAudioRecording,
    pauseRecording,
    resumeRecording,
    stopRecording: stopAudioRecording,
    getAudioBlob
  } = useAudioRecording();
  
  const { 
    audioWaveform,
    setupAnalyser,
    startWaveformAnimation,
    stopWaveformAnimation 
  } = useAudioWaveform();
  
  const { 
    transcribeAudio: transcribe 
  } = useAudioTranscription({
    onTranscriptionComplete: options?.onTranscriptionComplete
  });

  const startRecording = async () => {
    if (isRecording) return;
    
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) return;
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      setupAnalyser(stream);
      await startAudioRecording(stream);
      startWaveformAnimation();
      
    } catch (error) {
      logger.error("Error starting recording:", error);
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    
    stopWaveformAnimation();
    await stopAudioRecording();
  };

  const transcribeAudio = async (options?: { consultaId?: string | null }): Promise<string> => {
    setIsTranscribing(true);
    audioProcessingRef.current = true;
    
    try {
      const audioBlob = getAudioBlob();
      
      if (!audioBlob) {
        logger.error("No audio blob available for transcription");
        return "";
      }
      
      return await transcribe(audioBlob, options);
    } catch (error) {
      logger.error("Error transcribing audio:", error);
      return "";
    } finally {
      setIsTranscribing(false);
      audioProcessingRef.current = false;
    }
  };

  return {
    isRecording,
    isPaused,
    isTranscribing,
    audioURL,
    audioWaveform,
    permissionDenied,
    requestPermission,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    transcribeAudio,
    getAudioBlob
  };
}
