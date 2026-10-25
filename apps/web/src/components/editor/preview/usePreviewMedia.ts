/** Resolves preview media through the proxy cache and exposes clip capabilities. */
import { useCallback, useMemo } from "react";
import {
  getMediaItemCapabilities,
  type Mask,
  type MediaItem,
  type Project,
  type ShapeClip,
  type StickerClip,
  type Subtitle,
  type SVGClip,
  type TextClip,
} from "@openreel/core";
import { previewProxyCache } from "../../../stores/preview-proxy-store";
import { drawFrameWithMasks, drawFrameWithTransform } from "./canvas-renderers";
import type { PreviewClip, PreviewFrameSource } from "./preview-runtime-types";
import type { ClipTransform } from "./types";

interface PreviewMediaOptions {
  project: Project;
  proxySourceRevision: number;
  getOriginalMediaItem: (id: string) => MediaItem | undefined;
  getTitleEngine: () => { getAllTextClips: () => TextClip[] } | null;
  getGraphicsEngine: () => {
    getAllShapeClips: () => ShapeClip[];
    getAllSVGClips: () => SVGClip[];
    getAllStickerClips: () => StickerClip[];
  } | null;
  getMaskEngine: () => Promise<Parameters<typeof drawFrameWithMasks>[0]["maskEngine"]>;
}

export const usePreviewMedia = ({
  project,
  proxySourceRevision,
  getOriginalMediaItem,
  getTitleEngine,
  getGraphicsEngine,
  getMaskEngine,
}: PreviewMediaOptions) => {
  const getMediaItem = useCallback((id: string) => {
    const item = getOriginalMediaItem(id);
    return item ? previewProxyCache.resolve(project.id, item) : undefined;
    // Source changes must restart callbacks even though the cache lookup is live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOriginalMediaItem, project.id, proxySourceRevision]);

  const failProxyPlayback = useCallback((id: string, blob: Blob | null) => {
    if (blob) previewProxyCache.failPlayback(id, blob);
  }, []);

  const mediaClipHasVisual = useCallback(
    (clip: PreviewClip) =>
      getMediaItemCapabilities(getMediaItem(clip.mediaId)).visual,
    [getMediaItem],
  );
  const mediaClipHasAudio = useCallback(
    (clip: PreviewClip) =>
      getMediaItemCapabilities(getOriginalMediaItem(clip.mediaId)).audio,
    [getOriginalMediaItem],
  );

  const allTextClips = useMemo(() => {
    if (project.textClips) return project.textClips;
    const titleEngine = getTitleEngine();
    return titleEngine?.getAllTextClips() || [];
  }, [getTitleEngine, project.textClips]);

  const allShapeClips = useMemo(() => {
    if (
      project.shapeClips ||
      project.svgClips ||
      project.stickerClips
    ) {
      return [
        ...(project.shapeClips ?? []),
        ...(project.svgClips ?? []),
        ...(project.stickerClips ?? []),
      ];
    }
    const graphicsEngine = getGraphicsEngine();
    const shapes = graphicsEngine?.getAllShapeClips() || [];
    const svgs = graphicsEngine?.getAllSVGClips() || [];
    const stickers = graphicsEngine?.getAllStickerClips() || [];
    return [...shapes, ...svgs, ...stickers];
  }, [
    getGraphicsEngine,
    project.shapeClips,
    project.stickerClips,
    project.svgClips,
  ]);

  const clipMasksById = useMemo(() => {
    const byClip = new Map<string, Mask[]>();
    for (const mask of project.masks ?? []) {
      const existing = byClip.get(mask.clipId) ?? [];
      byClip.set(mask.clipId, [...existing, mask]);
    }
    return byClip;
  }, [project.masks]);

  const drawClipFrame = useCallback(
    async (
      ctx: CanvasRenderingContext2D,
      clipId: string,
      frame: PreviewFrameSource,
      transform: ClipTransform,
      canvasWidth: number,
      canvasHeight: number,
      time: number,
      filter?: string,
    ) => {
      const masks = clipMasksById.get(clipId) ?? [];
      if (masks.length === 0) {
        drawFrameWithTransform(
          ctx,
          frame,
          transform,
          canvasWidth,
          canvasHeight,
          filter,
        );
        return;
      }

      try {
        const maskEngine = await getMaskEngine();
        await drawFrameWithMasks({
          ctx,
          frame,
          transform,
          canvasWidth,
          canvasHeight,
          masks,
          maskEngine,
          time,
          filter,
        });
      } catch (error) {
        console.warn(`[Preview] Failed to apply masks to ${clipId}:`, error);
        drawFrameWithTransform(
          ctx,
          frame,
          transform,
          canvasWidth,
          canvasHeight,
          filter,
        );
      }
    },
    [clipMasksById, getMaskEngine],
  );

  const allSubtitles = useMemo(() => project.timeline.subtitles || [], [project.timeline.subtitles]);

  return {
    allShapeClips,
    allSubtitles,
    allTextClips,
    clipMasksById,
    drawClipFrame,
    failProxyPlayback,
    getMediaItem,
    mediaClipHasAudio,
    mediaClipHasVisual,
  };
};
