/** Preview frame preparation and stabilization transforms. */

import type { Track } from "@openreel/core";
import { getStabilizedTransform } from "@openreel/core";
import { applyEffectsToFrame, applyEffectsToFrameCanvas } from "./canvas-renderers";
import type { ClipTransform } from "./types";
import type { PreparedPreviewFrame } from "./preview-runtime-types";
import { clipNeedsFrameProcessing } from "./preview-adjustment-layers";

export const preparePreviewFrame = async (
  clipId: string,
  frameCanvas: HTMLCanvasElement | OffscreenCanvas,
  preferBitmap: boolean,
  allowCanvasByRef = false,
): Promise<PreparedPreviewFrame> => {
  const needsProcessing = clipNeedsFrameProcessing(clipId);
  if (!preferBitmap && !needsProcessing) {
    return {
      frame: frameCanvas,
      cleanup: () => {},
    };
  }

  let frameBitmap: ImageBitmap | null = null;
  let processedFrame: ImageBitmap | null = null;

  try {
    frameBitmap = await createImageBitmap(frameCanvas);

    if (!needsProcessing) {
      return {
        frame: frameBitmap,
        cleanup: () => {
          frameBitmap?.close();
        },
      };
    }

    if (allowCanvasByRef) {
      const effectsCanvas = await applyEffectsToFrameCanvas(
        clipId,
        frameBitmap,
      );
      if (effectsCanvas) {
        const sourceBitmap = frameBitmap;
        return {
          frame: effectsCanvas,
          cleanup: () => {
            sourceBitmap.close();
          },
        };
      }
    }

    processedFrame = await applyEffectsToFrame(clipId, frameBitmap);
    if (processedFrame === frameBitmap) {
      return {
        frame: frameBitmap,
        cleanup: () => {
          frameBitmap?.close();
        },
      };
    }

    return {
      frame: processedFrame,
      cleanup: () => {
        processedFrame?.close();
        frameBitmap?.close();
      },
    };
  } catch {
    processedFrame?.close();
    frameBitmap?.close();

    return {
      frame: frameCanvas,
      cleanup: () => {},
    };
  }
};

export const scaleTransformPositionForPreview = (
  transform: ClipTransform,
  scale: number,
): ClipTransform => {
  if (scale === 1) {
    return transform;
  }
  return {
    ...transform,
    position: {
      x: transform.position.x * scale,
      y: transform.position.y * scale,
    },
  };
};

export const applyStabilizationTransform = (
  clip: Track["clips"][number],
  transform: ClipTransform,
  sourceTime: number,
  canvasWidth: number,
  canvasHeight: number,
  frameWidth: number,
  frameHeight: number,
): ClipTransform => {
  return getStabilizedTransform(
    clip,
    transform,
    sourceTime,
    {
      canvasWidth,
      canvasHeight,
      sourceWidth: frameWidth,
      sourceHeight: frameHeight,
    },
  ) as ClipTransform;
};
