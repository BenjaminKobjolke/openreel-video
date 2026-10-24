import {
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "@/icons/lucide-compat";
import { ToolcraftIconButton as IconButton } from "@openreel/ui";

interface PreviewPlaybackButtonsProps {
  isPlaying: boolean;
  playbackLockedReason: string | null;
  onSkipBack: () => void;
  onTogglePlayback: () => void;
  onSkipForward: () => void;
}

export function PreviewPlaybackButtons({
  isPlaying,
  playbackLockedReason,
  onSkipBack,
  onTogglePlayback,
  onSkipForward,
}: PreviewPlaybackButtonsProps) {
  return (
    <div data-preview-playback className="flex items-center gap-4 mx-auto">
      <IconButton
        label="Skip back 5s"
        icon={<SkipBack size={18} />}
        variant="ghost"
        size="sm"
        onClick={onSkipBack}
        className="w-8 h-8 grid place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg transition-colors"
      />
      <IconButton
        label={playbackLockedReason ?? (isPlaying ? "Pause" : "Play")}
        icon={
          isPlaying ? (
            <Pause size={18} fill="currentColor" />
          ) : playbackLockedReason ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Play size={18} fill="currentColor" className="ml-0.5" />
          )
        }
        variant="ghost"
        size="md"
        onClick={onTogglePlayback}
        isDisabled={Boolean(playbackLockedReason)}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
          playbackLockedReason
            ? "bg-bg-2 text-fg-muted cursor-not-allowed"
            : "bg-bg-2 text-fg hover:bg-bg-3"
        }`}
      />
      <IconButton
        label="Skip forward 5s"
        icon={<SkipForward size={18} />}
        variant="ghost"
        size="sm"
        onClick={onSkipForward}
        className="w-8 h-8 grid place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg transition-colors"
      />
    </div>
  );
}
