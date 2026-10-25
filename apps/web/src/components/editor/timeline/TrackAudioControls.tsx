import React from "react";
import { Volume2, VolumeX } from "@/icons/lucide-compat";
import type { Track } from "@openreel/core";

interface TrackAudioControlsProps {
  track: Track;
  onMute: () => void;
  onSolo: () => void;
}

export const TrackAudioControls: React.FC<TrackAudioControlsProps> = ({
  track,
  onMute,
  onSolo,
}) => (
  <>
    <button
      type="button"
      aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
      aria-pressed={track.muted}
      title={track.muted ? "Unmute track" : "Mute track"}
      className={`transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        track.muted ? "text-destructive" : "text-fg-muted hover:text-fg-2"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onMute();
      }}
    >
      {track.muted ? (
        <VolumeX size={15} strokeWidth={1.7} aria-hidden />
      ) : (
        <Volume2 size={15} strokeWidth={1.7} aria-hidden />
      )}
    </button>
    <button
      type="button"
      aria-label={track.solo ? `Clear solo ${track.name}` : `Solo ${track.name}`}
      aria-pressed={track.solo}
      title={track.solo ? "Clear solo" : "Solo track"}
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 text-[9px] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        track.solo
          ? "bg-status-warning text-black"
          : "text-fg-muted hover:bg-hover hover:text-fg-2"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onSolo();
      }}
    >
      S
    </button>
  </>
);
