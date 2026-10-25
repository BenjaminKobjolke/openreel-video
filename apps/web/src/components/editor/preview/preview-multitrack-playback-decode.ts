/** Decodes the active clip frames needed by multitrack playback. */
import { getSpeedEngine } from "@openreel/core";
import {
  applyEmphasisAnimation,
  getAnimatedTransform,
} from "./canvas-renderers";
import {
  applyStabilizationTransform,
  preparePreviewFrame,
  scaleTransformPositionForPreview,
} from "./preview-frame-prep";
import { hasBehindSubjectText } from "./preview-subject-mask";
import type { PlaybackClipAtTime } from "./preview-playback-clips";
import type { MultiTrackPlaybackContext } from "./preview-runtime-types";
import { DEFAULT_TRANSFORM, type ClipTransform } from "./types";

export interface DecodedMultiTrackFrame {
  clip: PlaybackClipAtTime["clip"];
  transform: ClipTransform;
  frame: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
  cleanup?: () => void;
}

export interface DecodedMultiTrackFrames {
  validFrames: DecodedMultiTrackFrame[];
  validVideoFrames: DecodedMultiTrackFrame[];
  activeTextNeedsSubject: boolean;
}

export const decodeMultiTrackFrames = async (
  context: MultiTrackPlaybackContext,
  currentPlayhead: number,
  activeClips: PlaybackClipAtTime[],
  activeTextClips: ReturnType<typeof import("./canvas-renderers").getActiveTextClips>,
): Promise<DecodedMultiTrackFrames> => {
  const { refs, previewRes, getMediaItem } = context;
  const canvas = refs.canvasRef.current;
  if (!canvas) {
    return { validFrames: [], validVideoFrames: [], activeTextNeedsSubject: false };
  }

  const activeClipIds = new Set(activeClips.map(({ clip }) => clip.id));
  for (const [clipId, resources] of refs.playbackResourcesRef.current) {
    if (!activeClipIds.has(clipId)) {
      resources.input[Symbol.dispose]?.();
      refs.playbackResourcesRef.current.delete(clipId);
    }
  }

  const sortedClips = [...activeClips].sort((a, b) => b.trackIndex - a.trackIndex);
  const activeTextNeedsSubject = hasBehindSubjectText(activeTextClips);
  const useGPUFrames = refs.rendererRef.current?.type === "webgpu" && !activeTextNeedsSubject;
  const imageClipFrames: DecodedMultiTrackFrame[] = [];
  const videoClipPromises: Array<Promise<DecodedMultiTrackFrame | null>> = [];

  for (const { clip } of sortedClips) {
    if (!context.isActive()) continue;
    const clipLocalTime = currentPlayhead - clip.startTime;
    let transform = scaleTransformPositionForPreview(
      getAnimatedTransform(
        (clip.transform as ClipTransform) || DEFAULT_TRANSFORM,
        clip.keyframes,
        clipLocalTime,
      ),
      previewRes.scale,
    );

    if (clip.emphasisAnimation && clip.emphasisAnimation.type !== "none") {
      const emphasisState = applyEmphasisAnimation(clip.emphasisAnimation, clipLocalTime);
      transform = {
        ...transform,
        opacity: transform.opacity * emphasisState.opacity,
        scale: {
          x: transform.scale.x * emphasisState.scale * emphasisState.scaleX,
          y: transform.scale.y * emphasisState.scale * emphasisState.scaleY,
        },
        position: {
          x: transform.position.x + emphasisState.offsetX * canvas.width,
          y: transform.position.y + emphasisState.offsetY * canvas.height,
        },
        rotation: transform.rotation + emphasisState.rotation,
      };
    }

    const clipMedia = getMediaItem(clip.mediaId);
    if (clipMedia?.type === "image") {
      let cachedBitmap = refs.imageBitmapCacheRef.current.get(clip.id);
      if (
        !cachedBitmap &&
        clipMedia.blob instanceof Blob &&
        !refs.failedImageDecodesRef.current.has(clip.id)
      ) {
        try {
          cachedBitmap = await createImageBitmap(clipMedia.blob);
          refs.imageBitmapCacheRef.current.set(clip.id, cachedBitmap);
        } catch (error) {
          refs.failedImageDecodesRef.current.add(clip.id);
          console.warn(`[Preview] On-demand image decode failed for clip ${clip.id}:`, error);
        }
      }
      if (cachedBitmap) imageClipFrames.push({ clip, transform, frame: cachedBitmap });
      continue;
    }

    videoClipPromises.push(
      (async () => {
        const resources = refs.playbackResourcesRef.current.get(clip.id);
        if (!resources) return null;
        const speedEngine = getSpeedEngine();
        const adjustedLocalTime = speedEngine.getSourceTimeAtPlaybackTime(clip.id, clipLocalTime);
        const sourceTime = Math.max(
          clip.inPoint,
          Math.min(clip.outPoint, (clip.inPoint || 0) + adjustedLocalTime),
        );
        try {
          const frameResult = await (
            resources.sink as {
              getCanvas: (time: number) => Promise<{
                canvas: HTMLCanvasElement | OffscreenCanvas;
                timestamp: number;
                duration: number;
              } | null>;
            }
          ).getCanvas(sourceTime);
          if (!context.isActive()) return null;
          if (frameResult?.canvas) {
            const preparedFrame = await preparePreviewFrame(
              clip.id,
              frameResult.canvas,
              useGPUFrames,
            );
            const stabilizedTransform = applyStabilizationTransform(
              clip,
              transform,
              sourceTime,
              canvas.width,
              canvas.height,
              preparedFrame.frame.width,
              preparedFrame.frame.height,
            );
            return {
              clip,
              transform: stabilizedTransform,
              frame: preparedFrame.frame,
              cleanup: preparedFrame.cleanup,
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("disposed") || !context.isActive()) return null;
          console.warn(`[Preview] Failed to get frame for clip ${clip.id}:`, error);
        }
        return null;
      })(),
    );
  }

  const videoFrameResults = await Promise.all(videoClipPromises);
  const validVideoFrames = videoFrameResults.filter(
    (frame): frame is DecodedMultiTrackFrame => frame !== null,
  );
  return {
    validFrames: [...imageClipFrames, ...validVideoFrames],
    validVideoFrames,
    activeTextNeedsSubject,
  };
};
