import { useMemo } from "react";
import type { ShapeClip, StickerClip, SVGClip, TextClip, Track } from "@openreel/core";
import type { SelectionItem } from "../../../stores/ui-store";
import type { PreviewClip } from "./preview-runtime-types";

interface PreviewSelectionOptions {
  selectedItems: SelectionItem[];
  timelineTracks: Track[];
  allTextClips: TextClip[];
  allShapeClips: (ShapeClip | SVGClip | StickerClip)[];
  playheadPosition: number;
  mediaClipHasVisual: (clip: PreviewClip) => boolean;
}

export function usePreviewSelection({
  selectedItems,
  timelineTracks,
  allTextClips,
  allShapeClips,
  playheadPosition,
  mediaClipHasVisual,
}: PreviewSelectionOptions) {
  const selectedClipId = useMemo(() => {
    const clipSelection = selectedItems.find((item) => item.type === "clip");
    return clipSelection?.id || null;
  }, [selectedItems]);

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of timelineTracks) {
      const clip = track.clips.find((candidate) => candidate.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [selectedClipId, timelineTracks]);

  const clipAtPlayhead = useMemo(() => {
    const videoTracks = timelineTracks.filter((track) => !track.hidden);
    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (!mediaClipHasVisual(clip)) continue;
        const clipEnd = clip.startTime + clip.duration;
        if (playheadPosition >= clip.startTime && playheadPosition < clipEnd) return clip;
      }
    }
    return null;
  }, [timelineTracks, playheadPosition, mediaClipHasVisual]);

  const selectedTextClipId = useMemo(() => {
    const selection = selectedItems.find((item) => item.type === "text-clip");
    return selection?.id || null;
  }, [selectedItems]);

  const selectedTextClip = useMemo(
    () => selectedTextClipId
      ? allTextClips.find((clip) => clip.id === selectedTextClipId) || null
      : null,
    [selectedTextClipId, allTextClips],
  );

  const selectedShapeClipId = useMemo(() => {
    const selection = selectedItems.find((item) => item.type === "shape-clip");
    return selection?.id || null;
  }, [selectedItems]);

  const selectedShapeClip = useMemo(() => selectedShapeClipId
    ? allShapeClips.find((clip) => clip.id === selectedShapeClipId) || null
    : null, [selectedShapeClipId, allShapeClips]);

  return { selectedClipId, selectedClip, clipAtPlayhead, selectedTextClipId, selectedTextClip, selectedShapeClipId, selectedShapeClip };
}
