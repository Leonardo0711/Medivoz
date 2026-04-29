
import { useRef, useState } from "react";

interface UseAudioWaveformResult {
  audioWaveform: number[];
  setupAnalyser: (stream: MediaStream) => void;
  startWaveformAnimation: () => void;
  stopWaveformAnimation: () => void;
}

export function useAudioWaveform(): UseAudioWaveformResult {
  const [audioWaveform, setAudioWaveform] = useState<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Set up audio context for waveform visualization
  const setupAnalyser = (stream: MediaStream) => {
    if (!audioContextRef.current) {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioContext();
    }
    
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;
    
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
  };

  // Handle waveform animation
  const startWaveformAnimation = () => {
    if (!analyserRef.current) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const updateWaveform = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Sample some points from the frequency data for the waveform
      const sampleSize = 40; // Number of points to show in waveform
      const sampledData = [];
      
      for (let i = 0; i < sampleSize; i++) {
        const index = Math.floor(i * (bufferLength / sampleSize));
        sampledData.push(dataArray[index]);
      }
      
      setAudioWaveform(sampledData);
      animationFrameRef.current = requestAnimationFrame(updateWaveform);
    };
    
    updateWaveform();
  };

  // Stop animation frame
  const stopWaveformAnimation = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  return {
    audioWaveform,
    setupAnalyser,
    startWaveformAnimation,
    stopWaveformAnimation
  };
}

