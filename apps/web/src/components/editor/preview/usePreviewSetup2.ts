import React, { useEffect } from "react";
import { useUIStore } from "../../../stores/ui-store";
import { getRenderBridge } from "../../../bridges/render-bridge";
import { RendererFactory, isWebGPUSupported, getParticleEngine, calculateProjectDuration } from "@openreel/core";
import { usePreviewRefMirror, usePreviewStartPositionMirror } from "./usePreviewRefMirrors";
import type { GSAPMotionPathPoint, MotionPathConfig } from "@openreel/core";
import type { PreviewSetup1 } from "./usePreviewSetup1";

export function usePreviewSetup2(previous: PreviewSetup1) {
  const {
    allShapeClips, allTextClips, canvasRef, currentVideoMediaIdRef, decoderCacheRef,
    isPlaying, isRenderBridgeReady, nativeImageBitmapCacheRef, nativeVideoCacheRef,
    playbackRate, playheadPosition, previewRes, project,
    refs, releaseScrubVideoElements, releaseVideoElement, renderBridgeInitialized, rendererInitialSizeRef,
    rendererInitializedRef, rendererRef, setIsRenderBridgeReady, setRendererType,
    videoElementRef, videoUrlRef,
  } = previous;

    const selectedItems = useUIStore((state) => state.selectedItems);
    const cropMode = useUIStore((state) => state.cropMode);
    const cropClipId = useUIStore((state) => state.cropClipId);
    const setCropMode = useUIStore((state) => state.setCropMode);
    const exportState = useUIStore((state) => state.exportState);
    const motionPathMode = useUIStore((state) => state.motionPathMode);
    const motionPathClipId = useUIStore((state) => state.motionPathClipId);
    const select = useUIStore((state) => state.select);
  
    const motionPathClip = React.useMemo(() => {
      if (!motionPathMode || !motionPathClipId) return null;
      for (const track of project.timeline.tracks) {
        const clip = track.clips.find((c) => c.id === motionPathClipId);
        if (clip) return clip;
      }
      return null;
    }, [motionPathMode, motionPathClipId, project.timeline.tracks]);
  
    const [motionPathConfig, setMotionPathConfig] = React.useState<MotionPathConfig | null>(null);
  
    React.useEffect(() => {
      if (motionPathClip) {
        setMotionPathConfig({
          clipId: motionPathClip.id,
          enabled: true,
          pathType: "bezier",
          points: [],
          showPath: true,
          autoOrient: false,
          alignOrigin: [0.5, 0.5],
        });
      } else {
        setMotionPathConfig(null);
      }
    }, [motionPathClip]);
  
    const handleMotionPathPointMove = React.useCallback(
      (index: number, x: number, y: number) => {
        setMotionPathConfig((prev) => {
          if (!prev) return prev;
          const newPoints = [...prev.points];
          newPoints[index] = { ...newPoints[index], x, y };
          return { ...prev, points: newPoints };
        });
      },
      []
    );
  
    const handleMotionPathPointAdd = React.useCallback(
      (point: GSAPMotionPathPoint) => {
        setMotionPathConfig((prev) => {
          if (!prev) return prev;
          const newPoints = [...prev.points, point].sort((a, b) => a.time - b.time);
          return { ...prev, points: newPoints };
        });
      },
      []
    );
  
    const handleMotionPathPointRemove = React.useCallback((index: number) => {
      setMotionPathConfig((prev) => {
        if (!prev) return prev;
        const newPoints = prev.points.filter((_, i) => i !== index);
        return { ...prev, points: newPoints };
      });
    }, []);
  
    const handleMotionPathControlPointMove = React.useCallback(
      (pointIndex: number, handleType: "cp1" | "cp2", x: number, y: number) => {
        setMotionPathConfig((prev) => {
          if (!prev) return prev;
          const newPoints = [...prev.points];
          const point = newPoints[pointIndex];
          if (!point.controlPoints) {
            point.controlPoints = { cp1: { x: 0, y: 0 }, cp2: { x: 0, y: 0 } };
          }
          point.controlPoints[handleType] = { x, y };
          return { ...prev, points: newPoints };
        });
      },
      []
    );
  
    const particleEngine = React.useMemo(() => getParticleEngine(), []);
    const [particleEffects, setParticleEffects] = React.useState(
      () => particleEngine.getAllEffects()
    );
  
    React.useEffect(() => {
      return particleEngine.onEffectsChange(() => {
        setParticleEffects(particleEngine.getAllEffects());
      });
    }, [particleEngine]);
  
    // Calculate the actual end time for playback (where clips actually end)
    // This needs to recalculate whenever the timeline changes
    // Includes video/audio/image clips, text clips, and shape clips
    const actualEndTime = React.useMemo(() => {
      const tracks = project.timeline.tracks;
      let maxEnd = 0;
  
      for (const track of tracks) {
        for (const clip of track.clips) {
          const end = clip.startTime + clip.duration;
          if (end > maxEnd) maxEnd = end;
        }
      }
  
      for (const textClip of allTextClips) {
        const end = textClip.startTime + textClip.duration;
        if (end > maxEnd) maxEnd = end;
      }
  
      for (const shapeClip of allShapeClips) {
        const end = shapeClip.startTime + shapeClip.duration;
        if (end > maxEnd) maxEnd = end;
      }
  
      return Math.max(maxEnd, calculateProjectDuration(project));
    }, [project, allTextClips, allShapeClips]);
  
    // RenderBridge is guaranteed to be initialized before Preview renders (see EditorInterface)
    useEffect(() => {
      if (renderBridgeInitialized.current) return;
  
      const bridge = getRenderBridge();
      if (canvasRef.current) {
        bridge.setCanvas(canvasRef.current);
      }
      renderBridgeInitialized.current = true;
      setIsRenderBridgeReady(true);
    }, [canvasRef, renderBridgeInitialized, setIsRenderBridgeReady]);
  
    useEffect(() => {
      const decoderCache = decoderCacheRef.current;
      const nativeVideoCache = nativeVideoCacheRef.current;
      const nativeImageBitmapCache = nativeImageBitmapCacheRef.current;
  
      return () => {
        for (const entry of decoderCache.values()) {
          entry.input[Symbol.dispose]?.();
        }
        decoderCache.clear();
  
        releaseScrubVideoElements();
  
        if (videoElementRef.current) {
          videoElementRef.current.pause();
          videoElementRef.current.removeAttribute("src");
          videoElementRef.current.load();
          videoElementRef.current = null;
        }
        if (videoUrlRef.current) {
          URL.revokeObjectURL(videoUrlRef.current);
          videoUrlRef.current = null;
        }
        currentVideoMediaIdRef.current = null;
  
        for (const [, entry] of nativeVideoCache) {
          releaseVideoElement(entry);
        }
        nativeVideoCache.clear();
  
        for (const [, bitmap] of nativeImageBitmapCache) {
          bitmap.close();
        }
        nativeImageBitmapCache.clear();
      };
    }, [
      currentVideoMediaIdRef,
      decoderCacheRef,
      nativeImageBitmapCacheRef,
      nativeVideoCacheRef,
      releaseScrubVideoElements,
      releaseVideoElement,
      videoElementRef,
      videoUrlRef,
    ]);
  
    // Set canvas internal resolution ONLY when project settings change
    // This follows the WebGPU best practice of keeping internal resolution fixed
    // and using CSS/transforms for display scaling (prevents flickering during resize)
    // Using useLayoutEffect to ensure canvas size is set before first paint
    React.useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
  
      // Always ensure canvas has correct size
      if (
        canvas.width !== previewRes.width ||
        canvas.height !== previewRes.height
      ) {
        canvas.width = previewRes.width;
        canvas.height = previewRes.height;
      }
    }, [canvasRef, previewRes.width, previewRes.height]);
  
    useEffect(() => {
      if (isRenderBridgeReady && canvasRef.current) {
        const bridge = getRenderBridge();
        bridge.setCanvas(canvasRef.current);
      }
    }, [canvasRef, isRenderBridgeReady]);
  
    /**
     * Initialize WebGPU renderer for GPU-accelerated rendering (once on mount)
     */
    useEffect(() => {
      if (rendererInitializedRef.current || !canvasRef.current) return;
  
      const initializeRenderer = async () => {
        try {
          const canvas = canvasRef.current;
          if (!canvas) return;
  
          const factory = RendererFactory.getInstance();
          const renderer = await factory.createRenderer({
            canvas,
            width: rendererInitialSizeRef.current.width,
            height: rendererInitialSizeRef.current.height,
            preferredRenderer: isWebGPUSupported() ? "webgpu" : "canvas2d",
          });
  
          rendererRef.current = renderer;
          rendererInitializedRef.current = true;
          setRendererType(renderer.type);
  
          renderer.onDeviceLost(() => {
            console.warn("[Preview] GPU device lost, attempting recovery...");
            renderer.recreateDevice().then((success) => {
              if (!success) {
                console.error("[Preview] Failed to recover GPU device");
                setRendererType("canvas2d");
              }
            });
          });
        } catch (error) {
          console.warn("[Preview] Failed to initialize GPU renderer:", error);
          setRendererType("canvas2d");
        }
      };
  
      initializeRenderer();
  
      return () => {
        if (rendererRef.current) {
          rendererRef.current.destroy();
          rendererRef.current = null;
          rendererInitializedRef.current = false;
        }
      };
    }, [
      canvasRef,
      rendererInitialSizeRef,
      rendererInitializedRef,
      rendererRef,
      setRendererType,
    ]);
  
    /**
     * Handle canvas resize events
     *
     * Update preview at 60fps when dragging to resize
     */
    useEffect(() => {
      if (rendererRef.current && canvasRef.current) {
        const canvas = canvasRef.current;
        if (
          canvas.width !== previewRes.width ||
          canvas.height !== previewRes.height
        ) {
          rendererRef.current.resize(previewRes.width, previewRes.height);
        }
      }
    }, [canvasRef, previewRes.width, previewRes.height, rendererRef]);
  
    usePreviewRefMirror(refs.rateRef, playbackRate);
  
    usePreviewStartPositionMirror(refs.startPositionRef, isPlaying, playheadPosition);
  
  
  return { ...previous,
    selectedItems, cropMode, cropClipId, setCropMode, exportState,
    motionPathMode, motionPathClipId, select, motionPathClip, motionPathConfig,
    setMotionPathConfig, handleMotionPathPointMove, handleMotionPathPointAdd, handleMotionPathPointRemove, handleMotionPathControlPointMove,
    particleEngine, particleEffects, setParticleEffects, actualEndTime,
  };
}

export type PreviewSetup2 = ReturnType<typeof usePreviewSetup2>;
