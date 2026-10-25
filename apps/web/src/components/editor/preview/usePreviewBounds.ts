import { useCallback, useMemo, useState } from "react";
import type { MediaItem, ShapeClip, StickerClip, Subtitle, SVGClip, TextClip } from "@openreel/core";
import { getCaptionWrapWidth } from "@openreel/core";
import { getActiveShapeClips } from "./canvas-renderers";
import type { PreviewRefs, PreviewClip } from "./preview-runtime-types";
import type { ClipTransform } from "./types";
import type { TitleEngine } from "@openreel/core";

type Shape = ShapeClip | SVGClip | StickerClip;
interface PreviewClipBoundsOptions {
  refs: PreviewRefs;
  selectedClip: PreviewClip | null;
  clipAtPlayhead: PreviewClip | null;
  canvasSize: { width: number; height: number };
  getTransformAtPlayhead: (clip: PreviewClip) => ClipTransform;
  liveTransform: { position: { x: number; y: number }; scale: { x: number; y: number } } | null;
  settings: { width: number; height: number };
  getMediaItem: (id: string) => MediaItem | undefined;
  selectedTextClip: TextClip | null;
  getTitleEngine: () => TitleEngine | null;
}

interface PreviewGraphicBoundsOptions {
  refs: PreviewRefs; settings: { width: number; height: number };
  allShapeClips: Shape[];
  playheadPosition: number;
  selectedItems: { type: string; id: string }[];
  allSubtitles: Subtitle[];
  selectedShapeClip: Shape | null;
}

export function usePreviewClipBounds(options: PreviewClipBoundsOptions) {
  const { refs, selectedClip, clipAtPlayhead, canvasSize, getTransformAtPlayhead, liveTransform,
    settings, getMediaItem, selectedTextClip, getTitleEngine } = options;
  const { canvasRef, overlayRef } = refs;
  const clipBounds = useMemo(() => {
    const clip = selectedClip || clipAtPlayhead;
    if (!clip || !canvasRef.current || !overlayRef.current) return null;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const canvasDisplayWidth = canvasRect.width || canvasSize.width;
    const canvasDisplayHeight = canvasRect.height || canvasSize.height;

    const clipTransform = getTransformAtPlayhead(clip);

    const transform = liveTransform
      ? {
          ...clipTransform,
          position: liveTransform.position,
          scale: liveTransform.scale,
        }
      : clipTransform;

    const canvasWidth = settings.width;
    const canvasHeight = settings.height;

    const canvasAspect = canvasWidth / canvasHeight;
    const elementAspect = canvasDisplayWidth / canvasDisplayHeight;

    let actualWidth: number;
    let actualHeight: number;
    let letterboxOffsetX = 0;
    let letterboxOffsetY = 0;

    if (elementAspect > canvasAspect) {
      actualHeight = canvasDisplayHeight;
      actualWidth = actualHeight * canvasAspect;
      letterboxOffsetX = (canvasDisplayWidth - actualWidth) / 2;
    } else {
      actualWidth = canvasDisplayWidth;
      actualHeight = actualWidth / canvasAspect;
      letterboxOffsetY = (canvasDisplayHeight - actualHeight) / 2;
    }

    const displayScale = actualWidth / canvasWidth;

    const fitMode =
      !clipTransform.fitMode || clipTransform.fitMode === "none"
        ? "contain"
        : clipTransform.fitMode;
    const mediaItem = getMediaItem(clip.mediaId);
    const mediaWidth = mediaItem?.metadata?.width ?? canvasWidth;
    const mediaHeight = mediaItem?.metadata?.height ?? canvasHeight;

    let baseWidth: number;
    let baseHeight: number;

    if (fitMode === "stretch") {
      baseWidth = canvasWidth;
      baseHeight = canvasHeight;
    } else if (fitMode === "cover") {
      const mediaAspect = mediaWidth / mediaHeight;
      if (mediaAspect > canvasAspect) {
        baseHeight = canvasHeight;
        baseWidth = canvasHeight * mediaAspect;
      } else {
        baseWidth = canvasWidth;
        baseHeight = canvasWidth / mediaAspect;
      }
    } else {
      const mediaAspect = mediaWidth / mediaHeight;
      if (mediaAspect > canvasAspect) {
        baseWidth = canvasWidth;
        baseHeight = canvasWidth / mediaAspect;
      } else {
        baseHeight = canvasHeight;
        baseWidth = canvasHeight * mediaAspect;
      }
    }

    const clipWidth = baseWidth * transform.scale.x * displayScale;
    const clipHeight = baseHeight * transform.scale.y * displayScale;

    const offsetX = transform.position.x * displayScale;
    const offsetY = transform.position.y * displayScale;

    const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
    const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

    const centerX = canvasOffsetX + actualWidth / 2 + offsetX;
    const centerY = canvasOffsetY + actualHeight / 2 + offsetY;

    return {
      x: centerX - clipWidth / 2,
      y: centerY - clipHeight / 2,
      width: clipWidth,
      height: clipHeight,
      centerX,
      centerY,
      displayScale,
    };
  }, [
    selectedClip,
    clipAtPlayhead,
    settings.width,
    settings.height,
    canvasSize,
    liveTransform,
    getMediaItem,
    getTransformAtPlayhead, canvasRef, overlayRef,
  ]);

  const textClipBounds = useMemo(() => {
    if (!selectedTextClip || !canvasRef.current || !overlayRef.current)
      return null;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const canvasDisplayWidth = canvasRect.width || canvasSize.width;
    const canvasDisplayHeight = canvasRect.height || canvasSize.height;

    const { transform, style, text } = selectedTextClip;

    const canvasWidth = settings.width;
    const canvasHeight = settings.height;

    const canvasAspect = canvasWidth / canvasHeight;
    const elementAspect = canvasDisplayWidth / canvasDisplayHeight;

    let actualWidth: number;
    let actualHeight: number;
    let letterboxOffsetX = 0;
    let letterboxOffsetY = 0;

    if (elementAspect > canvasAspect) {
      actualHeight = canvasDisplayHeight;
      actualWidth = actualHeight * canvasAspect;
      letterboxOffsetX = (canvasDisplayWidth - actualWidth) / 2;
    } else {
      actualWidth = canvasDisplayWidth;
      actualHeight = actualWidth / canvasAspect;
      letterboxOffsetY = (canvasDisplayHeight - actualHeight) / 2;
    }

    const displayScale = actualWidth / canvasWidth;

    const captionMetrics = getTitleEngine()?.measureText(
      text, style, getCaptionWrapWidth(selectedTextClip, canvasWidth),
    );
    const lines = captionMetrics?.lines.map((line) => line.text) ?? text.split("\n");
    const lineHeight = style.fontSize * style.lineHeight;
    const estimatedHeight = lines.length * lineHeight;
    const estimatedWidth = captionMetrics?.width ??
      style.fontSize * Math.max(...lines.map((l) => l.length)) * 0.6;

    const textWidth = estimatedWidth * transform.scale.x * displayScale;
    const textHeight = estimatedHeight * transform.scale.y * displayScale;

    const posX = transform.position.x * canvasWidth * displayScale;
    const posY = transform.position.y * canvasHeight * displayScale;

    const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
    const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

    const centerX = canvasOffsetX + posX;
    const centerY = canvasOffsetY + posY;

    return {
      x: centerX - textWidth / 2,
      y: centerY - textHeight / 2,
      width: textWidth,
      height: textHeight,
      centerX,
      centerY,
      displayScale,
      isTextClip: true,
    };
  }, [selectedTextClip, settings.width, settings.height, canvasSize, getTitleEngine, canvasRef, overlayRef]);

  return { clipBounds, textClipBounds };
}
export function usePreviewGraphicBounds(options: PreviewGraphicBoundsOptions) {
  const { refs, settings, allShapeClips, playheadPosition, selectedItems, allSubtitles, selectedShapeClip } = options;
  const { canvasRef, overlayRef } = refs;
  const [hoveredGraphicClipId, setHoveredGraphicClipId] = useState<string | null>(null);

  const activeGraphicClips = useMemo(() => {
    // getActiveShapeClips returns all graphic clip types (shapes, SVGs, and stickers)
    return getActiveShapeClips(allShapeClips, playheadPosition);
  }, [allShapeClips, playheadPosition]);

  const shapeClipBounds = useMemo(() => {
    if (!selectedShapeClip || !canvasRef.current || !overlayRef.current)
      return null;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const { transform } = selectedShapeClip;

    const canvasWidth = settings.width;
    const canvasHeight = settings.height;

    const canvasAspect = canvasWidth / canvasHeight;
    const elementAspect = canvasRect.width / canvasRect.height;

    let actualWidth: number;
    let actualHeight: number;
    let letterboxOffsetX = 0;
    let letterboxOffsetY = 0;

    if (elementAspect > canvasAspect) {
      actualHeight = canvasRect.height;
      actualWidth = actualHeight * canvasAspect;
      letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
    } else {
      actualWidth = canvasRect.width;
      actualHeight = actualWidth / canvasAspect;
      letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
    }

    const displayScale = actualWidth / canvasWidth;

    let baseWidth: number;
    let baseHeight: number;

    if (selectedShapeClip.type === "svg") {
      const svgClip = selectedShapeClip as SVGClip;
      const svgWidth = svgClip.viewBox?.width || 200;
      const svgHeight = svgClip.viewBox?.height || 200;
      const svgAspect = svgWidth / svgHeight;
      if (svgAspect > 1) {
        baseWidth = canvasWidth;
        baseHeight = canvasWidth / svgAspect;
      } else {
        baseHeight = canvasHeight;
        baseWidth = canvasHeight * svgAspect;
      }
    } else {
      baseWidth = 200;
      baseHeight = 200;
    }

    const shapeWidth = baseWidth * transform.scale.x * displayScale;
    const shapeHeight = baseHeight * transform.scale.y * displayScale;

    const posX = transform.position.x * canvasWidth * displayScale;
    const posY = transform.position.y * canvasHeight * displayScale;

    const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
    const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

    const centerX = canvasOffsetX + posX;
    const centerY = canvasOffsetY + posY;

    return {
      x: centerX - shapeWidth / 2,
      y: centerY - shapeHeight / 2,
      width: shapeWidth,
      height: shapeHeight,
      centerX,
      centerY,
      displayScale,
      isShapeClip: true,
    };
  }, [selectedShapeClip, settings.width, settings.height, canvasRef, overlayRef]);

  const getGraphicClipDisplayBounds = useCallback(
    (clip: ShapeClip | SVGClip | StickerClip) => {
      if (!canvasRef.current || !overlayRef.current) return null;

      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      const overlayRect = overlay.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      const { transform } = clip;

      const canvasWidth = settings.width;
      const canvasHeight = settings.height;

      const canvasAspect = canvasWidth / canvasHeight;
      const elementAspect = canvasRect.width / canvasRect.height;

      let actualWidth: number;
      let actualHeight: number;
      let letterboxOffsetX = 0;
      let letterboxOffsetY = 0;

      if (elementAspect > canvasAspect) {
        actualHeight = canvasRect.height;
        actualWidth = actualHeight * canvasAspect;
        letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
      } else {
        actualWidth = canvasRect.width;
        actualHeight = actualWidth / canvasAspect;
        letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
      }

      const displayScale = actualWidth / canvasWidth;

      let baseWidth: number;
      let baseHeight: number;

      if (clip.type === "svg") {
        const svgClip = clip as SVGClip;
        const svgW = svgClip.viewBox?.width || 200;
        const svgH = svgClip.viewBox?.height || 200;
        const svgAspect = svgW / svgH;
        if (svgAspect > 1) {
          baseWidth = canvasWidth;
          baseHeight = canvasWidth / svgAspect;
        } else {
          baseHeight = canvasHeight;
          baseWidth = canvasHeight * svgAspect;
        }
      } else {
        baseWidth = 200;
        baseHeight = 200;
      }

      const shapeWidth = baseWidth * transform.scale.x * displayScale;
      const shapeHeight = baseHeight * transform.scale.y * displayScale;

      const posX = transform.position.x * canvasWidth * displayScale;
      const posY = transform.position.y * canvasHeight * displayScale;

      const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
      const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

      const centerX = canvasOffsetX + posX;
      const centerY = canvasOffsetY + posY;

      return {
        x: centerX - shapeWidth / 2,
        y: centerY - shapeHeight / 2,
        width: shapeWidth,
        height: shapeHeight,
        centerX,
        centerY,
      };
    },
    [settings.width, settings.height, canvasRef, overlayRef],
  );

  const findGraphicClipAtPoint = useCallback(
    (clientX: number, clientY: number): ShapeClip | SVGClip | StickerClip | null => {
      if (!overlayRef.current) return null;
      const overlayRect = overlayRef.current.getBoundingClientRect();
      const pointX = clientX - overlayRect.left;
      const pointY = clientY - overlayRect.top;

      for (let i = activeGraphicClips.length - 1; i >= 0; i--) {
        const clip = activeGraphicClips[i];
        const bounds = getGraphicClipDisplayBounds(clip);
        if (!bounds) continue;

        if (
          pointX >= bounds.x &&
          pointX <= bounds.x + bounds.width &&
          pointY >= bounds.y &&
          pointY <= bounds.y + bounds.height
        ) {
          return clip;
        }
      }
      return null;
    },
    [activeGraphicClips, getGraphicClipDisplayBounds, overlayRef],
  );

  const selectedSubtitleId = useMemo(() => {
    const subtitleSelection = selectedItems.find(
      (item) => item.type === "subtitle",
    );
    return subtitleSelection?.id || null;
  }, [selectedItems]);

  const selectedSubtitleObj = useMemo<Subtitle | null>(() => {
    if (!selectedSubtitleId) return null;
    return allSubtitles.find((sub) => sub.id === selectedSubtitleId) || null;
  }, [selectedSubtitleId, allSubtitles]);

  const subtitleBounds = useMemo(() => {
    if (!selectedSubtitleObj || !canvasRef.current || !overlayRef.current)
      return null;
    if (
      playheadPosition < selectedSubtitleObj.startTime ||
      playheadPosition >= selectedSubtitleObj.endTime
    )
      return null;

    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const overlayRect = overlay.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const fontSize = selectedSubtitleObj.style?.fontSize || 24;
    const position = selectedSubtitleObj.style?.position || "bottom";
    const lines = selectedSubtitleObj.text.split("\n");
    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;

    const canvasWidth = settings.width;
    const canvasHeight = settings.height;

    const canvasAspect = canvasWidth / canvasHeight;
    const elementAspect = canvasRect.width / canvasRect.height;

    let actualWidth: number;
    let actualHeight: number;
    let letterboxOffsetX = 0;
    let letterboxOffsetY = 0;

    if (elementAspect > canvasAspect) {
      actualHeight = canvasRect.height;
      actualWidth = actualHeight * canvasAspect;
      letterboxOffsetX = (canvasRect.width - actualWidth) / 2;
    } else {
      actualWidth = canvasRect.width;
      actualHeight = actualWidth / canvasAspect;
      letterboxOffsetY = (canvasRect.height - actualHeight) / 2;
    }

    const displayScale = actualWidth / canvasWidth;

    let baseY: number;
    if (position === "top") {
      baseY = fontSize * 2;
    } else if (position === "center") {
      baseY = canvasHeight / 2 - totalHeight / 2;
    } else {
      baseY = canvasHeight - fontSize * 2 - totalHeight;
    }

    const subtitleWidth = canvasWidth * 0.8 * displayScale;
    const subtitleHeight = totalHeight * displayScale;

    const canvasOffsetX = canvasRect.left - overlayRect.left + letterboxOffsetX;
    const canvasOffsetY = canvasRect.top - overlayRect.top + letterboxOffsetY;

    const centerX = canvasOffsetX + actualWidth / 2;
    const topY = canvasOffsetY + baseY * displayScale;

    return {
      x: centerX - subtitleWidth / 2,
      y: topY,
      width: subtitleWidth,
      height: subtitleHeight,
      centerX,
      centerY: topY + subtitleHeight / 2,
      displayScale,
    };
  }, [
    selectedSubtitleObj,
    settings.width,
    settings.height,
    playheadPosition, canvasRef, overlayRef,
  ]);

  return { hoveredGraphicClipId, setHoveredGraphicClipId, activeGraphicClips, shapeClipBounds, getGraphicClipDisplayBounds, findGraphicClipAtPoint, selectedSubtitleId, selectedSubtitleObj, subtitleBounds };
}
