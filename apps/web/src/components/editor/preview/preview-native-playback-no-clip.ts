/** Draws image, shape, text, motion, and subtitle frames when no video clip is active. */
import {
  drawFrameWithTransform,
  getActiveShapeClips,
  getActiveSubtitles,
  getActiveTextClips,
  getAnimatedTransform,
  renderSubtitleToCanvas,
  DEFAULT_TRANSFORM,
} from "./index";
import { scaleTransformPositionForPreview } from "./preview-frame-prep";
import type { PreviewClip, PreviewRefs } from "./preview-runtime-types";
import type { Subtitle } from "@openreel/core";
import type { ClipTransform } from "./types";
import type { usePreviewMotion } from "./usePreviewMotion";

interface NativeNoClipOptions {
  refs: PreviewRefs;
  currentPlayhead: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageClips: { clip: PreviewClip; trackIndex: number }[];
  imageBitmapCache: Map<string, ImageBitmap>;
  allSubtitles: Subtitle[];
  state: { rafId: number | null; currentClipId: string | null };
  previewScale: number;
  editingFrameDuration: number;
  fillPreviewBackground: (ctx: CanvasRenderingContext2D, time: number, width: number, height: number) => void;
  hasActiveMotionInstances: (time: number) => boolean;
  renderOverlayClipsInTrackOrder: ReturnType<typeof usePreviewMotion>["renderOverlayClipsInTrackOrder"];
  setPlayheadPosition: (position: number) => void;
  drawFrame: () => Promise<void>;
}

export const renderNativeNoClipFrame = async ({
  refs,
  currentPlayhead,
  canvas,
  ctx,
  imageClips,
  imageBitmapCache,
  allSubtitles,
  state,
  previewScale,
  editingFrameDuration,
  fillPreviewBackground,
  hasActiveMotionInstances,
  renderOverlayClipsInTrackOrder,
  setPlayheadPosition,
  drawFrame,
}: NativeNoClipOptions): Promise<void> => {
  const { timelineTracksRef, allShapeClipsRef, allTextClipsRef, playheadPositionRef, lastPlayheadUpdateRef } = refs;
  fillPreviewBackground(
            ctx,
            playheadPositionRef.current,
            canvas.width,
            canvas.height,
          );

          const sortedImageClipsNoVideo = [...imageClips].sort(
            (a, b) => b.trackIndex - a.trackIndex,
          );
          for (const { clip: imgClip } of sortedImageClipsNoVideo) {
            if (
              currentPlayhead >= imgClip.startTime &&
              currentPlayhead < imgClip.startTime + imgClip.duration
            ) {
              const bitmap = imageBitmapCache.get(imgClip.id);
              if (bitmap) {
                const latestImgClip = (() => {
                  for (const track of timelineTracksRef.current) {
                    const found = track.clips.find((c) => c.id === imgClip.id);
                    if (found) return found;
                  }
                  return imgClip;
                })();
                const imgClipLocalTime = currentPlayhead - imgClip.startTime;
                const imgTransform = scaleTransformPositionForPreview(
                  getAnimatedTransform(
                    (latestImgClip.transform as ClipTransform) ||
                      DEFAULT_TRANSFORM,
                    latestImgClip.keyframes,
                    imgClipLocalTime,
                  ),
                  previewScale,
                );
                drawFrameWithTransform(
                  ctx,
                  bitmap,
                  imgTransform,
                  canvas.width,
                  canvas.height,
                );
              }
            }
          }

          const activeShapeClipsNoVideo = getActiveShapeClips(
            allShapeClipsRef.current,
            currentPlayhead,
          );
          const activeTextClipsNoVideo = getActiveTextClips(
            allTextClipsRef.current,
            currentPlayhead,
          );

          if (
            activeShapeClipsNoVideo.length > 0 ||
            activeTextClipsNoVideo.length > 0 ||
            hasActiveMotionInstances(currentPlayhead)
          ) {
            await renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracksRef.current,
              activeShapeClipsNoVideo,
              activeTextClipsNoVideo,
              currentPlayhead,
              canvas.width,
              canvas.height,
              "all",
            );
          }

          const activeSubtitlesNoVideo = getActiveSubtitles(
            allSubtitles,
            currentPlayhead,
          );
          for (const subtitle of activeSubtitlesNoVideo) {
            renderSubtitleToCanvas(
              ctx,
              subtitle,
              canvas.width,
              canvas.height,
              currentPlayhead,
            );
          }

          const nowNoClip = performance.now();
          if (nowNoClip - lastPlayheadUpdateRef.current >= editingFrameDuration) {
            lastPlayheadUpdateRef.current = nowNoClip;
            setPlayheadPosition(currentPlayhead);
          }
          state.rafId = requestAnimationFrame(() => { drawFrame(); });
    return;
  
};
