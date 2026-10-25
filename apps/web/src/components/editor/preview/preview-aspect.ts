/** Aspect matching and fit calculations shared by Canvas and WebGPU preview paths. */

import { resolveCanvasFitDimensions } from "@openreel/core";
import type { ClipTransform } from "./types";

export const computeFitScale = (
  fitMode: ClipTransform["fitMode"],
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  crop?: ClipTransform["crop"],
): { x: number; y: number } => {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { x: 1, y: 1 };
  }
  const visibleSourceWidth = crop ? crop.width * sourceWidth : sourceWidth;
  const visibleSourceHeight = crop ? crop.height * sourceHeight : sourceHeight;
  const { width: drawWidth, height: drawHeight } =
    resolveCanvasFitDimensions(
      fitMode,
      visibleSourceWidth,
      visibleSourceHeight,
      canvasWidth,
      canvasHeight,
    );
  return { x: drawWidth / canvasWidth, y: drawHeight / canvasHeight };
};

export const ASPECT_PRESETS: Array<{
  label: string;
  width: number;
  height: number;
}> = [
  { label: "16:9", width: 1920, height: 1080 },
  { label: "9:16", width: 1080, height: 1920 },
  { label: "1:1", width: 1080, height: 1080 },
  { label: "4:5", width: 1080, height: 1350 },
  { label: "4:3", width: 1440, height: 1080 },
  { label: "21:9", width: 2560, height: 1080 },
];

export const aspectLabelFor = (width: number, height: number): string => {
  const ratio = width / height;
  let closest = ASPECT_PRESETS[0];
  let smallestDelta = Infinity;
  for (const preset of ASPECT_PRESETS) {
    const delta = Math.abs(preset.width / preset.height - ratio);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = preset;
    }
  }
  return smallestDelta < 0.01 ? closest.label : "Custom";
};

// Cover-fit and blur the live base frame to fill letterbox space.
export const drawBlurredBackdrop = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): void => {
  if (sourceWidth <= 0 || sourceHeight <= 0) return;
  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (sourceAspect > canvasAspect) {
    drawHeight = height;
    drawWidth = height * sourceAspect;
  } else {
    drawWidth = width;
    drawHeight = width / sourceAspect;
  }
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;
  const blurPx = Math.max(Math.min(width, height) / 32, 8);
  ctx.save();
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
};
