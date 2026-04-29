
import { formatTime } from "../audio-player/utils";
import { Slider } from "@/components/ui/slider";

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ProgressBar({ currentTime, duration, isLoaded, onSeek }: ProgressBarProps) {
  return (
    <div className="flex-1 flex flex-col gap-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      
      <input
        type="range"
        min="0"
        max={duration || 0}
        value={currentTime}
        onChange={onSeek}
        className="w-full h-2 bg-secondary/50 rounded-lg appearance-none cursor-pointer accent-primary"
        step="0.01"
        disabled={!isLoaded}
      />
    </div>
  );
}
