/** Renders motion assets and track ordered overlay layers in the preview. */
import { useCallback } from "react";
import {
  getVisibleTrackRenderOrder,
  MotionRenderer,
  type MediaItem,
  type MotionAsset,
  type Project,
  type ShapeClip,
  type StickerClip,
  type SVGClip,
  type TextClip,
  type Track,
} from "@openreel/core";
import {
  renderShapeClipWithEffects,
  renderTextClipWithSubjectMask,
} from "./preview-layer-effects";
import { getBehindSubjectStreamId } from "./preview-subject-mask";
import { scaleTransformPositionForPreview } from "./preview-frame-prep";
import type { PreviewRefs } from "./preview-runtime-types";
import type { ClipTransform } from "./types";
import { drawFrameWithTransform } from "./canvas-renderers";

interface PreviewMotionOptions {
  project: Project;
  previewScale: number;
  refs: PreviewRefs;
  getMediaItem: (id: string) => MediaItem | undefined;
  mediaClipHasVisual: (clip: Track["clips"][number]) => boolean;
  isPlaying: boolean;
}

export const usePreviewMotion = ({
  project,
  previewScale,
  refs,
  getMediaItem,
  mediaClipHasVisual,
  isPlaying,
}: PreviewMotionOptions) => {
  const resolveMotionImageAsset = useCallback(
    async (asset: MotionAsset): Promise<ImageBitmap | null> => {
      const cacheKey = asset.mediaId
        ? `media:${asset.mediaId}`
        : asset.url
          ? `url:${asset.url}`
          : `asset:${asset.id}`;
      const cached = refs.motionAssetBitmapCacheRef.current.get(cacheKey);
      if (cached) return cached;

      let blob: Blob | null = null;
      if (asset.mediaId) {
        const mediaItem = getMediaItem(asset.mediaId);
        if (mediaItem?.type === "image" && mediaItem.blob) {
          blob = mediaItem.blob;
        }
      } else if (asset.url) {
        try {
          const response = await fetch(asset.url);
          if (response.ok) {
            blob = await response.blob();
          }
        } catch {
          return null;
        }
      }

      if (!blob) return null;
      try {
        const bitmap = await createImageBitmap(blob);
        refs.motionAssetBitmapCacheRef.current.set(cacheKey, bitmap);
        return bitmap;
      } catch {
        return null;
      }
    },
    [getMediaItem, refs.motionAssetBitmapCacheRef],
  );

  const hasActiveMotionInstances = useCallback(
    (time: number, trackId?: string): boolean =>
      (project.motionInstances ?? []).some((instance) => {
        if (trackId && instance.trackId !== trackId) return false;
        return time >= instance.startTime && time < instance.startTime + instance.duration;
      }),
    [project.motionInstances],
  );

  const renderMotionInstancesForTrack = useCallback(
    async (
      ctx: CanvasRenderingContext2D,
      track: Track,
      time: number,
      canvasWidth: number,
      canvasHeight: number,
    ): Promise<boolean> => {
      const instances = (project.motionInstances ?? []).filter(
        (instance) =>
          instance.trackId === track.id &&
          time >= instance.startTime &&
          time < instance.startTime + instance.duration,
      );
      if (instances.length === 0) return false;

      const compositions = project.motionCompositions ?? [];
      const assetResolver = { resolveImageAsset: resolveMotionImageAsset };
      const renderer =
        refs.motionRendererRef.current ??
        (refs.motionRendererRef.current = new MotionRenderer());
      let rendered = false;

      for (const instance of instances) {
        const composition = compositions.find(
          (candidate) => candidate.id === instance.compositionId,
        );
        if (!composition) continue;

        let bitmap: ImageBitmap | null = null;
        try {
          bitmap = await renderer.renderInstance(
            composition,
            instance,
            time,
            compositions,
            assetResolver,
            1,
          );
          const baseTransform = scaleTransformPositionForPreview(
            instance.transform as ClipTransform,
            previewScale,
          );
          drawFrameWithTransform(
            ctx,
            bitmap,
            {
              ...baseTransform,
              opacity: instance.opacity * (baseTransform.opacity ?? 1),
            },
            canvasWidth,
            canvasHeight,
          );
          rendered = true;
        } catch (error) {
          console.warn(
            `[Preview] Motion render failed for instance ${instance.id}:`,
            error,
          );
        } finally {
          bitmap?.close();
        }
      }

      return rendered;
    },
    [
      project.motionCompositions,
      project.motionInstances,
      previewScale,
      refs.motionRendererRef,
      resolveMotionImageAsset,
    ],
  );

  const renderOverlayClipsInTrackOrder = useCallback(
    async (
      ctx: CanvasRenderingContext2D,
      tracks: Track[],
      shapeClips: (ShapeClip | SVGClip | StickerClip)[],
      textClips: TextClip[],
      time: number,
      canvasWidth: number,
      canvasHeight: number,
      mode: "below-video" | "above-video" | "all" = "all",
      subjectFrame: ImageBitmap | null = null,
    ) => {
      const subjectStreamId = getBehindSubjectStreamId(
        tracks,
        time,
        getMediaItem,
      );
      const videoImageTrackIndices = tracks
        .map((t, idx) => ({ track: t, originalIndex: idx }))
        .filter(
          ({ track }) =>
            !track.hidden &&
            track.clips.some(
              (clip) =>
                time >= clip.startTime &&
                time < clip.startTime + clip.duration &&
                mediaClipHasVisual(clip),
            ),
        )
        .map(({ originalIndex }) => originalIndex);

      const lowestVideoIndex =
        videoImageTrackIndices.length > 0
          ? Math.min(...videoImageTrackIndices)
          : Infinity;
      const highestVideoIndex =
        videoImageTrackIndices.length > 0
          ? Math.max(...videoImageTrackIndices)
          : -1;

      const overlayTracksWithIndex = getVisibleTrackRenderOrder(tracks);

      const tracksToRender = overlayTracksWithIndex.filter(
        ({ originalIndex }) => {
          if (mode === "below-video") {
            return originalIndex > highestVideoIndex;
          } else if (mode === "above-video") {
            return originalIndex < lowestVideoIndex;
          }
          return true;
        },
      );

      for (const { track } of tracksToRender) {
        const trackShapeClips = shapeClips.filter(
          (clip) => clip.trackId === track.id,
        );
        for (const shapeClip of trackShapeClips) {
          await renderShapeClipWithEffects(
            ctx,
            shapeClip,
            canvasWidth,
            canvasHeight,
            time,
          );
        }
        await renderMotionInstancesForTrack(
          ctx,
          track,
          time,
          canvasWidth,
          canvasHeight,
        );
        const trackTextClips = textClips.filter(
          (clip) => clip.trackId === track.id,
        );
        for (const textClip of trackTextClips) {
          await renderTextClipWithSubjectMask(
            ctx,
            textClip,
            canvasWidth,
            canvasHeight,
            time,
            subjectFrame,
            isPlaying,
            subjectStreamId,
          );
        }
      }
    },
    [getMediaItem, isPlaying, mediaClipHasVisual, renderMotionInstancesForTrack],
  );

  return {
    hasActiveMotionInstances,
    renderMotionInstancesForTrack,
    renderOverlayClipsInTrackOrder,
  };
};
