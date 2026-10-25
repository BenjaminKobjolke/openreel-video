import { useCallback } from "react";
import type { KeyboardEvent } from "react";
import type { ShapeClip, StickerClip, SVGClip, TextClip, Track } from "@openreel/core";
import type { SelectionItem } from "../../../stores/ui-store";
import type { PreviewClip } from "./preview-runtime-types";
import type { ClipTransform } from "./types";

interface PreviewKeyboardNudgeOptions {
  selectedItems: SelectionItem[];
  timelineTracks: Track[];
  allTextClips: TextClip[];
  allShapeClips: (ShapeClip | SVGClip | StickerClip)[];
  canvasWidth: number;
  canvasHeight: number;
  getTransformAtPlayhead: (clip: PreviewClip) => ClipTransform;
  beginHistoryGroup: (label: string) => void;
  endHistoryGroup: () => void;
  updateClipTransform: (clipId: string, transform: Partial<ClipTransform>) => Promise<unknown>;
  updateTextTransform: (clipId: string, transform: Partial<ClipTransform>) => void;
  updateShapeTransform: (clipId: string, transform: Partial<ClipTransform>) => void;
}

export function usePreviewKeyboardNudge({
  selectedItems,
  timelineTracks,
  allTextClips,
  allShapeClips,
  canvasWidth,
  canvasHeight,
  getTransformAtPlayhead,
  beginHistoryGroup,
  endHistoryGroup,
  updateClipTransform,
  updateTextTransform,
  updateShapeTransform,
}: PreviewKeyboardNudgeOptions) {
  return useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button, [contenteditable='true']")) return;
    const direction = event.key === "ArrowLeft" ? { x: -1, y: 0 }
      : event.key === "ArrowRight" ? { x: 1, y: 0 }
        : event.key === "ArrowUp" ? { x: 0, y: -1 }
          : event.key === "ArrowDown" ? { x: 0, y: 1 }
            : null;
    if (!direction || selectedItems.length === 0) return;

    const amount = event.shiftKey ? 10 : 1;
    const pixelX = direction.x * amount;
    const pixelY = direction.y * amount;
    const normalizedX = pixelX / Math.max(1, canvasWidth);
    const normalizedY = pixelY / Math.max(1, canvasHeight);
    const pending: Promise<unknown>[] = [];
    let changed = false;

    beginHistoryGroup("Nudge canvas selection");
    for (const item of selectedItems) {
      if (item.type === "clip") {
        const clip = timelineTracks.flatMap((track) => track.clips)
          .find((candidate) => candidate.id === item.id);
        if (!clip) continue;
        changed = true;
        const transform = getTransformAtPlayhead(clip);
        pending.push(updateClipTransform(item.id, {
          position: { x: transform.position.x + pixelX, y: transform.position.y + pixelY },
        }));
        continue;
      }
      if (item.type === "text-clip") {
        const clip = allTextClips.find((candidate) => candidate.id === item.id);
        if (!clip) continue;
        changed = true;
        updateTextTransform(item.id, {
          position: { x: clip.transform.position.x + normalizedX, y: clip.transform.position.y + normalizedY },
        });
        continue;
      }
      if (item.type === "shape-clip") {
        const clip = allShapeClips.find((candidate) => candidate.id === item.id);
        if (!clip) continue;
        changed = true;
        updateShapeTransform(item.id, {
          position: { x: clip.transform.position.x + normalizedX, y: clip.transform.position.y + normalizedY },
        });
      }
    }

    if (!changed) {
      endHistoryGroup();
      return;
    }
    event.preventDefault();
    void Promise.all(pending).finally(endHistoryGroup);
  }, [allShapeClips, allTextClips, beginHistoryGroup, endHistoryGroup,
    getTransformAtPlayhead, selectedItems, canvasHeight, canvasWidth,
    timelineTracks, updateClipTransform, updateShapeTransform, updateTextTransform]);
}
