/** WebGPU compositing helpers used by the editor preview. */

import type { Renderer } from "@openreel/core";
import type { GPULayer } from "./preview-runtime-types";
import type { ClipTransform } from "./types";
import { computeFitScale } from "./preview-aspect";

// Bake aspect-fit into the GPU transform so Canvas and WebGPU both letterbox.
export const renderFrameWithGPU = async (
  renderer: Renderer,
  frame: ImageBitmap,
  transform: ClipTransform,
  canvasWidth: number,
  canvasHeight: number,
): Promise<ImageBitmap | null> => {
  try {
    const device = renderer.getDevice();
    if (!device) {
      return null;
    }

    renderer.beginFrame();

    const texture = renderer.createTextureFromImage(frame);

    const fitScale = computeFitScale(
      transform.fitMode,
      frame.width,
      frame.height,
      canvasWidth,
      canvasHeight,
      transform.crop,
    );
    const gpuTransform = {
      position: transform.position,
      scale: {
        x: transform.scale.x * fitScale.x,
        y: transform.scale.y * fitScale.y,
      },
      rotation: transform.rotation,
      anchor: transform.anchor,
      opacity: transform.opacity,
      borderRadius: transform.borderRadius,
      crop: transform.crop,
    };

    renderer.renderLayer({
      texture,
      transform: gpuTransform,
      effects: [],
      opacity: transform.opacity,
      borderRadius: transform.borderRadius || 0,
    });

    const result = await renderer.endFrame();
    renderer.releaseTexture(texture);

    return result;
  } catch {
    return null;
  }
};

export const renderAllLayersWithGPU = async (
  renderer: Renderer,
  layers: GPULayer[],
  canvasWidth: number,
  canvasHeight: number,
): Promise<ImageBitmap | null> => {
  try {
    const device = renderer.getDevice();

    if (!device || layers.length === 0) {
      return null;
    }

    renderer.beginFrame();

    const textures: ReturnType<typeof renderer.createTextureFromImage>[] = [];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];

      const texture = renderer.createTextureFromImage(layer.bitmap);
      textures.push(texture);

      const fitScale = computeFitScale(
        layer.transform.fitMode,
        layer.bitmap.width,
        layer.bitmap.height,
        canvasWidth,
        canvasHeight,
        layer.transform.crop,
      );
      const gpuTransform = {
        position: layer.transform.position,
        scale: {
          x: layer.transform.scale.x * fitScale.x,
          y: layer.transform.scale.y * fitScale.y,
        },
        rotation: layer.transform.rotation,
        anchor: layer.transform.anchor,
        opacity: layer.transform.opacity,
        borderRadius: layer.transform.borderRadius,
        crop: layer.transform.crop,
      };

      renderer.renderLayer({
        texture,
        transform: gpuTransform,
        effects: [],
        opacity: layer.transform.opacity,
        borderRadius: layer.transform.borderRadius || 0,
      });
    }

    const result = await renderer.endFrame();

    for (const texture of textures) {
      renderer.releaseTexture(texture);
    }

    return result;
  } catch (e) {
    console.error("[renderAllLayersWithGPU] Error:", e);
    return null;
  }
};
