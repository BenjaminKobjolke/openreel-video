/** Renders a project frame through the preview compositor. */
import { useCallback } from "react";
import {
  type MediaItem,
  type Mask,
  type Project,
  type ShapeClip,
  type Subtitle,
  type TextClip,
  type Track,
  getSpeedEngine,
  getVisibleTrackRenderOrder,
} from "@openreel/core";
import { getRenderBridge } from "../../bridges/render-bridge";
import {
  applyPreviewAdjustmentLayers,
  clipCssFilterOnly,
} from "./preview-adjustment-layers";
import { applyStabilizationTransform, scaleTransformPositionForPreview } from "./preview-frame-prep";
import {
  captureSubjectFrame,
  drawBlurredBackdrop,
  hasBehindSubjectText,
} from "./preview-subject-mask";
import type { ClipTransform } from "./types";
import type { PreviewRefs, PreviewClip } from "./preview-runtime-types";
import type { usePreviewMedia } from "./usePreviewMedia";
import type { usePreviewMotion } from "./usePreviewMotion";
import { renderPreviewTransition } from "./preview-direct-transition";
import {
  applyEmphasisAnimation,
  applyEffectsToFrame,
  getAnimatedTransform,
  getActiveShapeClips,
  getActiveTextClips,
  getActiveSubtitles,
  getTransitionAtTime,
  renderSubtitleToCanvas,
} from "./index";

interface PreviewDirectRenderOptions {
  refs: PreviewRefs;
  timelineTracks: Track[];
  getMediaItem: (id: string) => MediaItem | undefined;
  decodeClipFrame: (clip: { id: string; mediaId: string; startTime: number; inPoint?: number }, time: number) => Promise<ImageBitmap | null>;
  previewRes: { width: number; height: number; scale: number };
  allTextClips: TextClip[];
  allShapeClips: (ShapeClip | import("@openreel/core").SVGClip | import("@openreel/core").StickerClip)[];
  allSubtitles: Subtitle[];
  renderOverlayClipsInTrackOrder: ReturnType<typeof usePreviewMotion>["renderOverlayClipsInTrackOrder"];
  renderMotionInstancesForTrack: ReturnType<typeof usePreviewMotion>["renderMotionInstancesForTrack"];
  hasActiveMotionInstances: (time: number) => boolean;
  clipMasksById: Map<string, Mask[]>;
  drawClipFrame: ReturnType<typeof usePreviewMedia>["drawClipFrame"];
  fillPreviewBackground: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, time: number, width: number, height: number) => void;
  isDark: boolean;
  isPlaying: boolean;
  project: Project;
  mediaClipHasVisual: (clip: PreviewClip) => boolean;
}

export const usePreviewDirectRender = (options: PreviewDirectRenderOptions) => {
  const {
    refs,
    timelineTracks,
    getMediaItem,
    decodeClipFrame,
    previewRes,
    allTextClips,
    allShapeClips,
    allSubtitles,
    renderOverlayClipsInTrackOrder,
    renderMotionInstancesForTrack,
    hasActiveMotionInstances,
    clipMasksById,
    drawClipFrame,
    fillPreviewBackground,
    isDark,
    isPlaying,
    project,
    mediaClipHasVisual,
  } = options;
  const {
    canvasRef,
    canvasFillModeRef,
    offscreenCanvasRef,
    offscreenCtxRef,
    lastGoodFrameRef,
  } = refs;
  return useCallback(
    async (time: number): Promise<boolean> => {
      const canvas = canvasRef.current;
      if (!canvas) return false;

      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = previewRes.width;
        canvas.height = previewRes.height;
      }

      const mainCtx = canvas.getContext("2d");
      if (!mainCtx) return false;

      // Compound clips are full nested timelines rather than media blobs.
      // Route those frames through the canonical compositor so preview and
      // export share identical nesting, timing, effects and transforms.
      const hasActiveCompound = timelineTracks.some((track) =>
        !track.hidden &&
        track.clips.some(
          (clip) =>
            typeof clip.metadata?.compoundClipId === "string" &&
            time >= clip.startTime &&
            time < clip.startTime + clip.duration,
        ),
      );
      if (hasActiveCompound) {
        const frame = await getRenderBridge().renderFrame(time);
        if (frame) {
          mainCtx.clearRect(0, 0, canvas.width, canvas.height);
          mainCtx.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
          return true;
        }
      }

      if (
        !offscreenCanvasRef.current ||
        offscreenCanvasRef.current.width !== canvas.width ||
        offscreenCanvasRef.current.height !== canvas.height
      ) {
        offscreenCanvasRef.current = new OffscreenCanvas(
          canvas.width,
          canvas.height,
        );
        offscreenCtxRef.current = offscreenCanvasRef.current.getContext(
          "2d",
        ) as OffscreenCanvasRenderingContext2D;
      }

      const ctx =
        offscreenCtxRef.current as unknown as CanvasRenderingContext2D;
      if (!ctx) return false;

      const videoTracks = timelineTracks.filter(
        (track) =>
          !track.hidden && track.clips.some((clip) => mediaClipHasVisual(clip)),
      );

      const state = { hasRenderedFrame: false, shouldClearCanvas: true };
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const activeShapeClips = getActiveShapeClips(allShapeClips, time);
      const activeTextClips = getActiveTextClips(allTextClips, time);
      const hasActiveClipMasks = videoTracks.some((track) =>
        track.clips.some(
          (clip) =>
            clipMasksById.has(clip.id) &&
            time >= clip.startTime &&
            time < clip.startTime + clip.duration,
        ),
      );
      if (hasActiveClipMasks) {
        // A masked layer contains transparent pixels. Reusing the previous full
        // frame underneath would make those pixels appear unmasked, so start
        // from the actual composition background before drawing the layer.
        fillPreviewBackground(ctx, time, canvas.width, canvas.height);
        state.shouldClearCanvas = false;
      }

      const transitionInfo = getTransitionAtTime(
        time,
        timelineTracks,
        mediaClipHasVisual,
      );

      if (transitionInfo) {
        await renderPreviewTransition({
          transitionInfo,
          state,
          canvas,
          ctx,
          time,
          timelineTracks,
          activeShapeClips,
          activeTextClips,
          decodeClipFrame,
          renderOverlayClipsInTrackOrder,
          fillPreviewBackground,
        });
      }
      if (!state.hasRenderedFrame) {
        const hasVideoContent = videoTracks.some((track) =>
          track.clips.some(
            (clip) =>
              mediaClipHasVisual(clip) &&
              time >= clip.startTime &&
              time < clip.startTime + clip.duration,
          ),
        );
        const hasMotionContent = hasActiveMotionInstances(time);

        if (
          state.shouldClearCanvas &&
          (hasVideoContent ||
            hasMotionContent ||
            activeShapeClips.length > 0 ||
            activeTextClips.length > 0)
        ) {
          if (hasVideoContent) {
            fillPreviewBackground(ctx, time, canvas.width, canvas.height);
          } else {
            ctx.fillStyle = isDark ? "#0f0f11" : "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          state.shouldClearCanvas = false;
        }

        // Render ALL tracks in layer order using painter's algorithm
        // Higher index = rendered first (appears behind), Lower index = rendered last (appears on top)
        const allRenderableTracks = getVisibleTrackRenderOrder(timelineTracks);

        let subjectFrame: ImageBitmap | null = null;
        const shouldCompositeSubject = hasBehindSubjectText(activeTextClips);
        let blurBackdropDrawn = false;

        for (const { track } of allRenderableTracks) {
          {
            for (const clip of track.clips) {
              if (!mediaClipHasVisual(clip)) continue;
              const clipStart = clip.startTime;
              const clipEnd = clip.startTime + clip.duration;

              if (time >= clipStart && time < clipEnd) {
                const frame = await decodeClipFrame(clip, time);

                if (frame) {
                  // The decoder returns native, un-letterboxed frames for both
                  // images and videos. Paint the first visible layer cover-fit
                  // behind the composition when the project uses blur fill.
                  if (
                    canvasFillModeRef.current === "blur" &&
                    !blurBackdropDrawn
                  ) {
                    drawBlurredBackdrop(
                      ctx,
                      frame,
                      frame.width,
                      frame.height,
                      canvas.width,
                      canvas.height,
                    );
                    blurBackdropDrawn = true;
                  }
                  const clipLocalTime = time - clip.startTime;
                  const speedEngine = getSpeedEngine();
                  const adjustedLocalTime = speedEngine.getSourceTimeAtPlaybackTime(
                    clip.id,
                    clipLocalTime,
                  );
                  const sourceTime = Math.max(
                    clip.inPoint,
                    Math.min(clip.outPoint, clip.inPoint + adjustedLocalTime),
                  );
                  let animatedTransform = scaleTransformPositionForPreview(
                    getAnimatedTransform(
                      clip.transform as ClipTransform,
                      clip.keyframes,
                      clipLocalTime,
                    ),
                    previewRes.scale,
                  );

                  if (
                    clip.emphasisAnimation &&
                    clip.emphasisAnimation.type !== "none"
                  ) {
                    const emphasisState = applyEmphasisAnimation(
                      clip.emphasisAnimation,
                      clipLocalTime,
                    );
                    animatedTransform = {
                      ...animatedTransform,
                      opacity:
                        animatedTransform.opacity * emphasisState.opacity,
                      scale: {
                        x:
                          animatedTransform.scale.x *
                          emphasisState.scale *
                          emphasisState.scaleX,
                        y:
                          animatedTransform.scale.y *
                          emphasisState.scale *
                          emphasisState.scaleY,
                      },
                      position: {
                        x:
                          animatedTransform.position.x +
                          emphasisState.offsetX * canvas.width,
                        y:
                          animatedTransform.position.y +
                          emphasisState.offsetY * canvas.height,
                      },
                      rotation:
                        animatedTransform.rotation + emphasisState.rotation,
                    };
                  }

                  const stabilizedTransform = applyStabilizationTransform(
                    clip,
                    animatedTransform,
                    sourceTime,
                    canvas.width,
                    canvas.height,
                    frame.width,
                    frame.height,
                  );

                  const nativeCssFilter = clipCssFilterOnly(clip.id);
                  let processedFrame: ImageBitmap | null = null;
                  try {
                    if (nativeCssFilter) {
                      await drawClipFrame(
                        ctx,
                        clip.id,
                        frame,
                        stabilizedTransform,
                        canvas.width,
                        canvas.height,
                        time,
                        nativeCssFilter,
                      );
                      state.hasRenderedFrame = true;
                    } else {
                      processedFrame = await applyEffectsToFrame(clip.id, frame);
                      if (processedFrame.width > 0 && processedFrame.height > 0) {
                        await drawClipFrame(
                          ctx,
                          clip.id,
                          processedFrame,
                          stabilizedTransform,
                          canvas.width,
                          canvas.height,
                          time,
                        );
                        state.hasRenderedFrame = true;
                      } else {
                        await drawClipFrame(
                          ctx,
                          clip.id,
                          frame,
                          stabilizedTransform,
                          canvas.width,
                          canvas.height,
                          time,
                        );
                        state.hasRenderedFrame = true;
                      }
                    }
                  } catch {
                    await drawClipFrame(
                      ctx,
                      clip.id,
                      frame,
                      stabilizedTransform,
                      canvas.width,
                      canvas.height,
                      time,
                    );
                    state.hasRenderedFrame = true;
                  } finally {
                    if (processedFrame && processedFrame !== frame) {
                      processedFrame.close();
                    }
                  }

                  if (shouldCompositeSubject) {
                    subjectFrame?.close();
                    subjectFrame = await captureSubjectFrame(
                      ctx,
                      canvas.width,
                      canvas.height,
                    );
                  }
                  frame.close();
                }
              }
            }
          }
          const trackShapeClips = activeShapeClips.filter(
            (clip) => clip.trackId === track.id,
          );
          for (const shapeClip of trackShapeClips) {
            await renderShapeClipWithEffects(
              ctx,
              shapeClip,
              canvas.width,
              canvas.height,
              time,
            );
            state.hasRenderedFrame = true;
          }
          if (
            await renderMotionInstancesForTrack(
              ctx,
              track,
              time,
              canvas.width,
              canvas.height,
            )
          ) {
            state.hasRenderedFrame = true;
          }
          const trackTextClips = activeTextClips.filter(
            (clip) => clip.trackId === track.id,
          );
          for (const textClip of trackTextClips) {
            await renderTextClipWithSubjectMask(
              ctx,
              textClip,
              canvas.width,
              canvas.height,
              time,
              subjectFrame,
              isPlaying,
              getBehindSubjectStreamId(timelineTracks, time, getMediaItem),
            );

            state.hasRenderedFrame = true;
          }
        }
        subjectFrame?.close();
      }

      const activeSubtitles = getActiveSubtitles(allSubtitles, time);
      if (activeSubtitles.length > 0 && ctx) {
        for (const subtitle of activeSubtitles) {
          renderSubtitleToCanvas(
            ctx,
            subtitle,
            canvas.width,
            canvas.height,
            time,
          );
        }
      }

      if (ctx && offscreenCanvasRef.current) {
        const adjusted = await applyPreviewAdjustmentLayers(
          offscreenCanvasRef.current,
          ctx,
          project.adjustmentLayers ?? [],
          time,
        );
        state.hasRenderedFrame = state.hasRenderedFrame || adjusted;
      }

      if (state.hasRenderedFrame && offscreenCanvasRef.current) {
        mainCtx.clearRect(0, 0, canvas.width, canvas.height);
        mainCtx.drawImage(offscreenCanvasRef.current, 0, 0);
        try {
          lastGoodFrameRef.current?.close();
          lastGoodFrameRef.current = await createImageBitmap(
            offscreenCanvasRef.current,
          );
        } catch {
          // Snapshot failures are recoverable; keep the already-rendered frame.
        }
        return true;
      }

      return state.hasRenderedFrame;
    },
    [
      timelineTracks,
      getMediaItem,
      decodeClipFrame,
      previewRes.width,
      previewRes.height,
      previewRes.scale,
      allTextClips,
      allShapeClips,
      allSubtitles,
      renderOverlayClipsInTrackOrder,
      renderMotionInstancesForTrack,
      hasActiveMotionInstances,
      clipMasksById,
      drawClipFrame,
      fillPreviewBackground,
      isDark,
      isPlaying,
      project.adjustmentLayers,
      mediaClipHasVisual,
    ],
  );
};
