
import { memo, useMemo } from "react";
import { useAudioPlayer } from "./audio-player/useAudioPlayer";
import { PlayerControls } from "./audio-player/PlayerControls";
import { ProgressBar } from "./audio-player/ProgressBar";
import { StatusIndicator } from "./audio-player/StatusIndicator";
import { Waveform } from "../../session/Waveform";
import { generateWaveformData } from "../recording/audio-player/utils/waveformUtils";
import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";

interface AudioPlayerProps {
  audioURL: string | null;
  isVisible: boolean;
}

export const AudioPlayer = memo(function AudioPlayer({ audioURL, isVisible }: AudioPlayerProps) {
  const {
    isPlaying,
    currentTime,
    duration,
    isLoaded,
    handlePlayPause,
    handleSeek
  } = useAudioPlayer(audioURL);
  
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const playbackProgress = useMemo(() => {
    return duration ? currentTime / duration : 0;
  }, [currentTime, duration]);
  
  // Generate waveform data when audio is loaded
  useEffect(() => {
    if (isLoaded && audioURL) {
      const data = generateWaveformData(40); // Generate 40 points for the waveform
      setWaveformData(data);
    }
  }, [isLoaded, audioURL]);

  if (!isVisible || !audioURL) {
    return null;
  }

  return (
    <div className="w-full p-4 bg-card rounded-md border shadow-sm dark:border-muted/20">
      <div className="flex items-center justify-between gap-4 mb-2">
        <PlayerControls
          isPlaying={isPlaying}
          isLoaded={isLoaded}
          onPlayPause={handlePlayPause}
        />
        
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          isLoaded={isLoaded}
          onSeek={handleSeek}
        />
      </div>
      
      <div className="mt-2 mb-1 bg-muted/30 p-2 rounded-md">
        <Waveform 
          data={waveformData} 
          height={32} 
          isActive={isPlaying}
          playbackProgress={playbackProgress}
          color="hsl(var(--primary))"
        />
      </div>
      
      <StatusIndicator isLoaded={isLoaded} isPlaying={isPlaying} />
    </div>
  );
});
