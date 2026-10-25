/** Composites a transition frame and its overlays into the preview canvas. */
import {
  applyEffectsToFrame,
  renderTransitionFrame,
  getTransitionAtTime,
} from "./index";
import { drawFrameWithTransform } from "./canvas-renderers";
import { createTransparentImageBitmap, hasBehindSubjectText } from "./preview-subject-mask";
import { DEFAULT_TRANSFORM } from "./types";
import type { Track, ShapeClip, TextClip } from "@openreel/core";
import type { usePreviewMotion } from "./usePreviewMotion";

interface TransitionRenderState {
  hasRenderedFrame: boolean;
  shouldClearCanvas: boolean;
}

interface TransitionRenderContext {
  transitionInfo: NonNullable<ReturnType<typeof getTransitionAtTime>>;
  state: TransitionRenderState;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  time: number;
  timelineTracks: Track[];
  activeShapeClips: ShapeClip[];
  activeTextClips: TextClip[];
  decodeClipFrame: (clip: { id: string; mediaId: string; startTime: number; inPoint?: number }, time: number) => Promise<ImageBitmap | null>;
  renderOverlayClipsInTrackOrder: ReturnType<typeof usePreviewMotion>["renderOverlayClipsInTrackOrder"];
  fillPreviewBackground: (ctx: CanvasRenderingContext2D, time: number, width: number, height: number) => void;
}

export const renderPreviewTransition = async ({
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
}: TransitionRenderContext): Promise<void> => {
      if (transitionInfo) {
        try {
          const clipAFrame = await decodeClipFrame(transitionInfo.clipA, time);
          const clipBFrame = transitionInfo.clipB
            ? await decodeClipFrame(transitionInfo.clipB, time)
            : null;
          const blankFrame = transitionInfo.clipB
            ? null
            : await createTransparentImageBitmap(canvas.width, canvas.height);
          const closeOnce = (() => {
            const closed = new Set<ImageBitmap>();
            return (bitmap: ImageBitmap | null | undefined) => {
              if (!bitmap || closed.has(bitmap)) return;
              closed.add(bitmap);
              bitmap.close();
            };
          })();

          if (clipAFrame && (clipBFrame || blankFrame)) {
            const processedA = await applyEffectsToFrame(
              transitionInfo.clipA.id,
              clipAFrame,
            );
            const processedB =
              transitionInfo.clipB && clipBFrame
                ? await applyEffectsToFrame(transitionInfo.clipB.id, clipBFrame)
                : null;

            const validA =
              processedA.width > 0 && processedA.height > 0
                ? processedA
                : clipAFrame;
            const validB =
              processedB && processedB.width > 0 && processedB.height > 0
                ? processedB
                : clipBFrame;
            const outgoingTransitionFrame =
              transitionInfo.clipB || transitionInfo.edge !== "in"
                ? validA
                : blankFrame;
            const incomingTransitionFrame = transitionInfo.clipB
              ? validB
              : transitionInfo.edge === "in"
                ? validA
                : blankFrame;

            const blendedFrame =
              outgoingTransitionFrame && incomingTransitionFrame
                ? await renderTransitionFrame(
                    transitionInfo,
                    outgoingTransitionFrame,
                    incomingTransitionFrame,
                  )
                : null;

            if (
              blendedFrame &&
              blendedFrame.width > 0 &&
              blendedFrame.height > 0
            ) {
              if (state.shouldClearCanvas) {
                fillPreviewBackground(ctx, time, canvas.width, canvas.height);
                state.shouldClearCanvas = false;
              }
              await renderOverlayClipsInTrackOrder(
                ctx,
                timelineTracks,
                activeShapeClips,
                activeTextClips,
                time,
                canvas.width,
                canvas.height,
                "below-video",
              );
              drawFrameWithTransform(
                ctx,
                blendedFrame,
                DEFAULT_TRANSFORM,
                canvas.width,
                canvas.height,
              );
              await renderOverlayClipsInTrackOrder(
                ctx,
                timelineTracks,
                activeShapeClips,
                activeTextClips,
                time,
                canvas.width,
                canvas.height,
                "above-video",
                hasBehindSubjectText(activeTextClips) ? blendedFrame : null,
              );
              if (processedA !== clipAFrame) closeOnce(processedA);
              if (processedB && processedB !== clipBFrame) closeOnce(processedB);
              closeOnce(clipAFrame);
              closeOnce(clipBFrame);
              closeOnce(blankFrame);
              if (
                blendedFrame !== validA &&
                blendedFrame !== validB &&
                blendedFrame !== blankFrame
              ) {
                closeOnce(blendedFrame);
              }
              state.hasRenderedFrame = true;
            }
            if (processedA !== clipAFrame) closeOnce(processedA);
            if (processedB && processedB !== clipBFrame) closeOnce(processedB);
            closeOnce(clipAFrame);
            closeOnce(clipBFrame);
            closeOnce(blankFrame);
            if (
              blendedFrame &&
              blendedFrame !== validA &&
              blendedFrame !== validB &&
              blendedFrame !== blankFrame
            ) {
              closeOnce(blendedFrame);
            }
          } else if (clipAFrame) {
            const processed = await applyEffectsToFrame(
              transitionInfo.clipA.id,
              clipAFrame,
            );
            const validFrame =
              processed.width > 0 && processed.height > 0
                ? processed
                : clipAFrame;
            if (state.shouldClearCanvas) {
              fillPreviewBackground(ctx, time, canvas.width, canvas.height);
              state.shouldClearCanvas = false;
            }
            await renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracks,
              activeShapeClips,
              activeTextClips,
              time,
              canvas.width,
              canvas.height,
              "below-video",
            );
            drawFrameWithTransform(
              ctx,
              validFrame,
              DEFAULT_TRANSFORM,
              canvas.width,
              canvas.height,
            );
            await renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracks,
              activeShapeClips,
              activeTextClips,
              time,
              canvas.width,
              canvas.height,
              "above-video",
              hasBehindSubjectText(activeTextClips) ? validFrame : null,
            );
            if (processed !== clipAFrame) {
              closeOnce(processed);
            }
            closeOnce(clipAFrame);
            state.hasRenderedFrame = true;
          } else if (clipBFrame && transitionInfo.clipB) {
            const processed = await applyEffectsToFrame(
              transitionInfo.clipB.id,
              clipBFrame,
            );
            const validFrame =
              processed.width > 0 && processed.height > 0
                ? processed
                : clipBFrame;
            if (state.shouldClearCanvas) {
              fillPreviewBackground(ctx, time, canvas.width, canvas.height);
              state.shouldClearCanvas = false;
            }
            await renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracks,
              activeShapeClips,
              activeTextClips,
              time,
              canvas.width,
              canvas.height,
              "below-video",
            );
            drawFrameWithTransform(
              ctx,
              validFrame,
              DEFAULT_TRANSFORM,
              canvas.width,
              canvas.height,
            );
            await renderOverlayClipsInTrackOrder(
              ctx,
              timelineTracks,
              activeShapeClips,
              activeTextClips,
              time,
              canvas.width,
              canvas.height,
              "above-video",
              hasBehindSubjectText(activeTextClips) ? validFrame : null,
            );
            if (processed !== clipBFrame) {
              closeOnce(processed);
            }
            closeOnce(clipBFrame);
            state.hasRenderedFrame = true;
          }
          closeOnce(blankFrame);
        } catch (error) {
          console.warn("[Preview] Transition render failed:", error);
        }
      }


};
