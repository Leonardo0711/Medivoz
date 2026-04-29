
import { Play, Pause } from "lucide-react";

interface PlayerControlsProps {
  isPlaying: boolean;
  isLoaded: boolean;
  onPlayPause: () => void;
}

export function PlayerControls({ isPlaying, isLoaded, onPlayPause }: PlayerControlsProps) {
  return (
    <button
      onClick={onPlayPause}
      disabled={!isLoaded}
      className="p-2 rounded-full bg-primary/90 text-primary-foreground hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:hover:bg-primary/80"
      aria-label={isPlaying ? "Pausar audio" : "Reproducir audio"}
    >
      {isPlaying ? (
        <Pause className="h-5 w-5" />
      ) : (
        <Play className="h-5 w-5" />
      )}
    </button>
  );
}
