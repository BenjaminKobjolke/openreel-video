import React, {
  useEffect,
  useCallback,
  useState,
  useMemo,
} from "react";
import { PreviewTimecode } from "./PreviewTimecode";
import { PreviewPlaybackButtons } from "./PreviewPlaybackButtons";
import { PreviewScrubBar } from "./PreviewScrubBar";
import { ExportProgressOverlay } from "./ExportProgressOverlay";
import { useCompactEditor } from "../../hooks/useCompactEditor";
import { useProjectFonts } from "../../hooks/useProjectFonts";
import { formatFrameTimecode } from "../../utils/frame-timecode";
import {
  Volume2,
  VolumeX,
  Monitor,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Move,
  ZoomIn,
  Proportions,
  Magnet,
  Repeat,
} from "@/icons/lucide-compat";
import { ToolcraftButton as Button } from "@openreel/ui";
import { ToolcraftIconButton as IconButton } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { useProjectStore } from "../../stores/project-store";
import { previewProxyCache, usePreviewProxyStore } from "../../stores/preview-proxy-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { useUIStore } from "../../stores/ui-store";
import { useThemeStore } from "../../stores/theme-store";
import { getRenderBridge } from "../../bridges/render-bridge";
import { getPlaybackBridge } from "../../bridges/playback-bridge";
import {
  RendererFactory,
  getCaptionWrapWidth,
  type Renderer,
  isWebGPUSupported,
  getSpeedEngine,
  getMasterClock,
  getRealtimeAudioGraph,
  getParticleEngine,
  MotionRenderer,
  type Effect,
  type TextClip,
  type ShapeClip,
  type SVGClip,
  type StickerClip,
  type Subtitle,
  type Track,
  getClipLocalTime,
  getVisibleTrackRenderOrder,
  trackHasAudioItems,
  calculateProjectDuration,
} from "@openreel/core";
import { useEngineStore } from "../../stores/engine-store";
import {
  type HandlePosition,
  type InteractionMode,
  type ClipTransform,
  DEFAULT_TRANSFORM,
  formatTime,
  getActiveTextClips,
  getActiveShapeClips,
  getActiveSubtitles,
  renderSubtitleToCanvas,
  drawFrameWithTransform,
  applyEffectsToFrame,
  getTransitionAtTime,
  setImageLoadCallback,
  renderTransitionFrame,
  renderTransitionCanvas,
  getAnimatedTransform,
  applyEmphasisAnimation,
  CropModeView,
  MotionPathOverlay,
  ParticleRenderer,
  computePreviewResolution,
  PREVIEW_MAX_DIMENSION,
  previewQualityScale,
  PREVIEW_QUALITY_OPTIONS,
} from "./preview/index";
import type {
  GPULayer,
  MultiTrackPlaybackState,
  PreviewClip,
} from "./preview/preview-runtime-types";
import {
  applyPreviewAdjustmentLayers,
  clipCssFilterOnly,
} from "./preview/preview-adjustment-layers";
import {
  applyStabilizationTransform,
  preparePreviewFrame,
  scaleTransformPositionForPreview,
} from "./preview/preview-frame-prep";
import {
  ASPECT_PRESETS,
  aspectLabelFor,
  drawBlurredBackdrop,
} from "./preview/preview-aspect";
import {
  renderAllLayersWithGPU,
  renderFrameWithGPU,
} from "./preview/preview-gpu-layers";
import {
  captureSubjectFrame,
  createTransparentCanvasSource,
  createTransparentImageBitmap,
  getBehindSubjectStreamId,
  hasBehindSubjectText,
} from "./preview/preview-subject-mask";
import {
  renderShapeClipWithEffects,
  renderTextClipWithSubjectMask,
} from "./preview/preview-layer-effects";
import {
  findAllClipsAtTime as selectAllClipsAtTime,
  findClipAtTime as selectClipAtTime,
  findNextClipStartTime as selectNextClipStartTime,
} from "./preview/preview-playback-clips";
import {
  initClipResources,
  preCacheAllImageBitmaps,
} from "./preview/preview-playback-resources";
import { usePreviewNativePlayback } from "./preview/usePreviewNativePlayback";
import { snapCanvasPosition } from "./preview/canvas-snapping";
import { resolvePlaybackLoop, resolvePlaybackStart } from "../../utils/playback-loop";
import { ProcessingOverlay } from "./ProcessingOverlay";
import { editingFrameDurationMs } from "./editing-frame-rate";
import { usePreviewRefs } from "./preview/usePreviewRefs";
import {
  usePreviewBackgroundMirror,
  usePreviewRefMirror,
  usePreviewStartPositionMirror,
} from "./preview/usePreviewRefMirrors";
import { usePreviewVideoCache } from "./preview/usePreviewVideoCache";
import { usePreviewMedia } from "./preview/usePreviewMedia";
import { usePreviewMotion } from "./preview/usePreviewMotion";
import { usePreviewAudio } from "./preview/usePreviewAudio";
import { usePreviewAudioScheduler } from "./preview/usePreviewAudioScheduler";
import { usePreviewDirectRender } from "./preview/usePreviewDirectRender";
import { usePreviewFallbackRender } from "./preview/usePreviewFallbackRender";
import {
  decodePreviewClipFrame,
  fillPreviewBackground as fillPreviewCanvasBackground,
} from "./preview/preview-decode-frame";
import {
  getBackgroundRemovalEngine,
  getVidstabEngine,
} from "@openreel/core";
import type {
  GSAPMotionPathPoint,
  MotionPathConfig,
} from "@openreel/core";
export const Preview: React.FC = () => {
  const compact = useCompactEditor();

  useEffect(() => () => {
    motionRendererRef.current?.dispose();
    motionRendererRef.current = null;
  }, []);

  const [isMuted, setIsMuted] = useState(false);
  const [isRenderBridgeReady, setIsRenderBridgeReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [videoAreaSize, setVideoAreaSize] = useState({ width: 0, height: 0 });
  const [, setRendererType] = useState<string>("none");
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const compactExpanded = compact && isMaximized;
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showCompositionGrid, setShowCompositionGrid] = useState(false);
  const [showSafeMargins, setShowSafeMargins] = useState(false);
  const [canvasSnappingEnabled, setCanvasSnappingEnabled] = useState(true);

  const ZOOM_OPTIONS = [
    { label: "50%", value: 0.5 },
    { label: "75%", value: 0.75 },
    { label: "100%", value: 1 },
    { label: "125%", value: 1.25 },
    { label: "150%", value: 1.5 },
    { label: "200%", value: 2 },
  ];

  const isDark = useThemeStore((state) => state.isDark);

  // Canvas interaction state for resize/move
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("none");
  const [activeHandle, setActiveHandle] = useState<HandlePosition | null>(null);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const STORE_UPDATE_THROTTLE_MS = 32;
  // Live transform state for immediate visual feedback during interaction
  const [liveTransform, setLiveTransform] = useState<{
    position: { x: number; y: number };
    scale: { x: number; y: number };
  } | null>(null);
  const [canvasSnapGuides, setCanvasSnapGuides] = useState<{
    x: number | null;
    y: number | null;
  }>({ x: null, y: null });

  // Track interaction target type (video clip or text clip)
  const [interactionTargetType, setInteractionTargetType] = useState<
    "clip" | "text-clip" | "shape-clip" | null
  >(null);

  // Track canvas size changes for resize handles positioning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
        // CSS resizing only moves handles. Replacing the drawing canvas here
        // can discard an in-flight decoded frame when maximizing or resizing.
        // Render paths allocate it at the actual canvas pixel resolution.
      }
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const videoArea = videoAreaRef.current;
    if (!videoArea) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setVideoAreaSize({ width, height });
      }
    });

    resizeObserver.observe(videoArea);
    return () => resizeObserver.disconnect();
  }, []);

  // Project store - subscribe to the entire project to ensure re-renders
  // when any part of the project changes (including clips)
  const project = useProjectStore((state) => state.project);
  const fontRevision = useProjectFonts(project);
  const getOriginalMediaItem = useProjectStore((state) => state.getMediaItem);
  const proxySourceRevision = usePreviewProxyStore((state) => state.revision);
  const getTitleEngine = useEngineStore((state) => state.getTitleEngine);
  const getGraphicsEngine = useEngineStore((state) => state.getGraphicsEngine);
  const getMaskEngine = useEngineStore((state) => state.getMaskEngine);
  // The revision restarts visual decoding when proxies are created/toggled/removed.
  const {
    allShapeClips,
    allSubtitles,
    allTextClips,
    clipMasksById,
    drawClipFrame,
    failProxyPlayback,
    getMediaItem,
    mediaClipHasAudio,
    mediaClipHasVisual,
  } = usePreviewMedia({
    project,
    proxySourceRevision,
    getOriginalMediaItem,
    getTitleEngine,
    getGraphicsEngine,
    getMaskEngine,
  });

  useEffect(() => {
    const cachedFrame = lastGoodFrameRef.current;
    lastGoodFrameRef.current = null;
    cachedFrame?.close();
  }, [project, proxySourceRevision]);

  const updateClipTransform = useProjectStore(
    (state) => state.updateClipTransform,
  );
  const updateTextTransform = useProjectStore(
    (state) => state.updateTextTransform,
  );
  const updateShapeTransform = useProjectStore(
    (state) => state.updateShapeTransform,
  );
  const beginHistoryGroup = useProjectStore((state) => state.beginHistoryGroup);
  const endHistoryGroup = useProjectStore((state) => state.endHistoryGroup);
  const updateSettings = useProjectStore((state) => state.updateSettings);
  const timelineTracks = project.timeline.tracks;
  const settings = project.settings;
  const editingFrameDuration = editingFrameDurationMs(settings.frameRate);

  const canvasFillMode = project.timeline.backgroundFillMode;
  const canvasFillColor = project.timeline.layoutBackgroundColor;


  const playbackQuality = useUIStore((state) => state.playbackQuality);
  const setPlaybackQuality = useUIStore((state) => state.setPlaybackQuality);
  const previewRes = useMemo(
    () =>
      computePreviewResolution(
        settings.width,
        settings.height,
        PREVIEW_MAX_DIMENSION *
          previewQualityScale(playbackQuality, settings.width, settings.height),
      ),
    [settings.width, settings.height, playbackQuality],
  );

  const {
    playheadPosition,
    playbackState,
    playbackLockedReason,
    playbackRate,
    loopEnabled,
    loopStart,
    loopEnd,
    isScrubbing,
    pause,
    togglePlayback,
    seekTo,
    seekRelative,
    setPlayheadPosition,
  } = useTimelineStore();
  const isPlaying = playbackState === "playing";
  const renderFrameDirectlyInitializer = {
    current: async (_time: number): Promise<boolean> => false,
  };
  const refs = usePreviewRefs({
    previewBg: isDark ? "#000000" : "#ffffff",
    rendererInitialSize: { width: previewRes.width, height: previewRes.height },
    timelineTracks,
    canvasFillMode,
    canvasFillColor,
    allTextClips,
    allShapeClips,
    allSubtitles,
    playbackRate,
    playheadPosition,
    renderFrameDirectly: (time) => renderFrameDirectlyInitializer.current(time),
    isPlaying,
    project,
    proxySourceRevision,
  });
  const {
    canvasRef,
    containerRef,
    videoAreaRef,
    overlayRef,
    animationRef,
    renderBridgeInitialized,
    lastGoodFrameRef,
    offscreenCanvasRef,
    decodeDebounceRef,
    decodeDebounceResolveRef,
    decodeRequestSeqRef,
    scrubVideoReleaseTimerRef,
    lastPreviewRenderTimeRef,
    offscreenCtxRef,
    videoElementRef,
    videoUrlRef,
    currentVideoMediaIdRef,
    nativePlaybackActiveRef,
    nativeVideoCacheRef,
    nativeImageBitmapCacheRef,
    audioSourceRef,
    gainNodeRef,
    audioGraphRef,
    audioBufferCacheRef,
    processedAudioBufferCacheRef,
    noAudioBufferRef,
    rendererRef,
    rendererInitializedRef,
    motionRendererRef,
    motionAssetBitmapCacheRef,
    previewBgRef,
    interactionStartRef,
    pendingTransformRef,
    rafIdRef,
    isInteractingRef,
    lastStoreUpdateRef,
    lastPlayheadUpdateRef,
    interactionTargetIdRef,
    videoElementCacheRef,
    decoderCacheRef,
    rendererInitialSizeRef,
    timelineTracksRef,
    canvasFillModeRef,
    canvasFillColorRef,
    allTextClipsRef,
    allShapeClipsRef,
    allSubtitlesRef,
    isScrubbingRef,
    rateRef,
    startPositionRef,
    playbackResourcesRef,
    imageBitmapCacheRef,
    failedImageDecodesRef,
    audioWarmupTimerRef,
    audioWarmupIdleRef,
    renderFrameDirectlyRef,
    isPlayingRef,
    playheadPositionRef,
    lastProjectForRenderRef,
    lastProxyRevisionForRenderRef,
    lastPlayheadForRenderRef,
    modifiedRenderTimerRef,
    renderInFlightRef,
    pendingRenderTimeRef,
  } = refs;
  const {
    cancelPendingScrubDecode,
    evictOldestVideoElement,
    releaseScrubVideoElements,
    releaseVideoElement,
    scheduleScrubVideoRelease,
  } = usePreviewVideoCache({ refs, proxySourceRevision });
  usePreviewBackgroundMirror(
    refs.previewBgRef,
    canvasFillMode,
    canvasFillColor,
    isDark,
  );

  const previewFrameSize = useMemo(() => {
    if (videoAreaSize.width <= 0 || videoAreaSize.height <= 0) {
      return { width: 0, height: 0 };
    }

    const aspectRatio = settings.width / settings.height;
    // Fill the available preview area (minus a small margin) while preserving
    // the project aspect ratio, instead of capping at a fixed small size which
    // left the monitor floating in unused space on larger screens.
    // ResizeObserver reports the content box: the video area's 18px padding
    // is already excluded. Leave only a small extra gutter for selection handles.
    const PREVIEW_PADDING = 4;
    const availableWidth = Math.max(1, videoAreaSize.width - PREVIEW_PADDING * 2);
    const availableHeight = Math.max(
      1,
      videoAreaSize.height - PREVIEW_PADDING * 2,
    );

    let width = availableWidth;
    let height = width / aspectRatio;

    if (height > availableHeight) {
      height = availableHeight;
      width = height * aspectRatio;
    }

    return {
      width: width * zoomLevel,
      height: height * zoomLevel,
    };
  }, [settings.height, settings.width, videoAreaSize, zoomLevel]);
  usePreviewRefMirror(refs.timelineTracksRef, timelineTracks);
  usePreviewRefMirror(refs.canvasFillModeRef, canvasFillMode);
  usePreviewRefMirror(refs.canvasFillColorRef, canvasFillColor);
  usePreviewRefMirror(refs.allTextClipsRef, allTextClips);
  usePreviewRefMirror(refs.allShapeClipsRef, allShapeClips);
  usePreviewRefMirror(refs.allSubtitlesRef, allSubtitles);
  usePreviewRefMirror(refs.isScrubbingRef, isScrubbing);

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
  }, []);

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
  }, [releaseScrubVideoElements, releaseVideoElement]);

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
  }, [previewRes.width, previewRes.height]);

  useEffect(() => {
    if (isRenderBridgeReady && canvasRef.current) {
      const bridge = getRenderBridge();
      bridge.setCanvas(canvasRef.current);
    }
  }, [isRenderBridgeReady]);

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
  }, []);

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
  }, [previewRes.width, previewRes.height]);

  usePreviewRefMirror(refs.rateRef, playbackRate);

  usePreviewStartPositionMirror(refs.startPositionRef, isPlaying, playheadPosition);

  const cleanupPlaybackResources = useCallback(() => {
    const resources = playbackResourcesRef.current;
    for (const [, resource] of resources) {
      resource.input[Symbol.dispose]?.();
    }
    playbackResourcesRef.current = new Map();

    for (const [, bitmap] of imageBitmapCacheRef.current) {
      bitmap.close();
    }
    imageBitmapCacheRef.current = new Map();

    for (const [, bitmap] of motionAssetBitmapCacheRef.current) {
      bitmap.close();
    }
    motionAssetBitmapCacheRef.current = new Map();
  }, []);

  const cleanupAudioResources = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        // Ignore errors if already stopped
      }
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (audioGraphRef.current) {
      audioGraphRef.current.stopScheduler();
      audioGraphRef.current.stopAllClips();
    }
  }, []);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : 1;
    }
    if (audioGraphRef.current) {
      audioGraphRef.current.setPreviewMuted(isMuted);
    }
  }, [isMuted]);

  const {
    getAudioEffectSignature,
    getPreviewAudioBufferForEffects,
    getResolvedClipAudioEffects,
    getResolvedClipVolumeAutomation,
    setupAudioFromAudioTrack,
  } = usePreviewAudio({
    refs,
    project,
    isMuted,
    getOriginalMediaItem,
    mediaClipHasAudio,
  });
  const {
    hasActiveMotionInstances,
    renderMotionInstancesForTrack,
    renderOverlayClipsInTrackOrder,
  } = usePreviewMotion({
    project,
    previewScale: previewRes.scale,
    refs,
    getMediaItem,
    mediaClipHasVisual,
    isPlaying,
  });
  const {
    getAudioClipsForScheduler,
    preDecodeAllAudioBuffers,
  } = usePreviewAudioScheduler({
    refs,
    timelineTracks,
    isPlaying,
    mediaClipHasAudio,
    getOriginalMediaItem,
    getAudioEffectSignature,
    getResolvedClipAudioEffects,
    getResolvedClipVolumeAutomation,
    getPreviewAudioBufferForEffects,
  });
  /**
   * Decode a single frame from a clip at a specific time using native video element
   * Native video elements provide reliable hardware-accelerated random-access seeking
   */
  const decodeClipFrame = useCallback(
    (
      clip: { id: string; mediaId: string; startTime: number; inPoint?: number },
      time: number,
    ): Promise<ImageBitmap | null> =>
      decodePreviewClipFrame(
        { refs, getMediaItem, failProxyPlayback, evictOldestVideoElement, releaseVideoElement, scheduleScrubVideoRelease },
        clip,
        time,
      ),
    [evictOldestVideoElement, failProxyPlayback, getMediaItem, releaseVideoElement, scheduleScrubVideoRelease],
  );

  const fillPreviewBackground = useCallback(
    (
      ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
      time: number,
      width: number,
      height: number,
    ): void => fillPreviewCanvasBackground(refs, ctx, time, width, height),
    [],
  );
  const renderFrameDirectly = usePreviewDirectRender({
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
  });
  renderFrameDirectlyInitializer.current = renderFrameDirectly;

  useEffect(() => {
    if (fontRevision > 0) void renderFrameDirectlyRef.current(useTimelineStore.getState().playheadPosition);
  }, [fontRevision]);
  usePreviewRefMirror(refs.renderFrameDirectlyRef, renderFrameDirectly);
  usePreviewRefMirror(refs.isPlayingRef, isPlaying);
  usePreviewRefMirror(refs.playheadPositionRef, playheadPosition);

  useEffect(() => {
    setImageLoadCallback(() => {
      if (!isPlayingRef.current) {
        renderFrameDirectlyRef.current(playheadPositionRef.current);
      }
    });
    return () => setImageLoadCallback(null);
  }, []);

  const { renderFallbackFrame, canUseNativeVideoPlayback } =
    usePreviewFallbackRender({
      refs,
      timelineTracks,
      previewRes,
      allTextClips,
      allShapeClips,
      allSubtitles,
      clipMasksById,
      getMediaItem,
      getResolvedClipAudioEffects,
      hasActiveMotionInstances,
      mediaClipHasAudio,
      mediaClipHasVisual,
      isDark,
      isPlaying,
    });
  // Start native video playback using hardware-accelerated video elements (handles multiple clips)
  const startNativeVideoPlayback = usePreviewNativePlayback({
    refs,
    timelineTracks,
    project,
    previewRes,
    actualEndTime,
    editingFrameDuration,
    allSubtitles,
    getMediaItem,
    failProxyPlayback,
    getAudioClipsForScheduler,
    preDecodeAllAudioBuffers,
    isMuted,
    releaseVideoElement,
    hasActiveMotionInstances,
    renderOverlayClipsInTrackOrder,
    mediaClipHasVisual,
    fillPreviewBackground,
    setPlayheadPosition,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (canvas.width === 0 || canvas.height === 0) {
      canvas.width = previewRes.width;
      canvas.height = previewRes.height;
    }

    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      cleanupAudioResources();
      return;
    }

    if (actualEndTime <= 0) {
      pause();
      return;
    }

    let isActive = true;
    let nativeCleanup: ((preserveCaches?: boolean) => void) | null = null;

    const startPosition = resolvePlaybackStart(
      startPositionRef.current,
      actualEndTime,
      resolvePlaybackLoop(useTimelineStore.getState(), actualEndTime),
    );
    if (startPosition !== startPositionRef.current) {
      startPositionRef.current = startPosition;
      setPlayheadPosition(startPosition);
    }
    const playbackStartPosition = startPositionRef.current;

    const findAllClipsAtTime = (time: number) => {
      return selectAllClipsAtTime(timelineTracksRef.current, time, mediaClipHasVisual);
    };

    const findClipAtTime = (time: number) => {
      return selectClipAtTime(timelineTracksRef.current, time, mediaClipHasVisual);
    };

    const _startPlaybackForClip = async (
      clip: (typeof timelineTracksRef.current)[0]["clips"][0],
      _track: (typeof timelineTracksRef.current)[0],
      timelinePosition: number,
    ) => {
      try {
        const mediaItem = getMediaItem(clip.mediaId);
        if (!mediaItem?.blob) {
          const clipEndTime = clip.startTime + clip.duration;
          const nextResult = findClipAtTime(clipEndTime);
          if (nextResult && clipEndTime < actualEndTime && isActive) {
            _startPlaybackForClip(
              nextResult.clip,
              nextResult.track,
              clipEndTime,
            );
          } else {
            pause();
          }
          return;
        }

        try {
          const mediabunny = await import("mediabunny");
          const { Input, ALL_FORMATS, BlobSource, CanvasSink } = mediabunny;

          const input = new Input({
            source: new BlobSource(mediaItem.blob),
            formats: ALL_FORMATS,
          });

          const videoTrack = await input.getPrimaryVideoTrack();
          if (!videoTrack || !isActive) {
            input[Symbol.dispose]?.();
            return;
          }

          const canDecode = await videoTrack.canDecode();
          if (!canDecode || !isActive) {
            input[Symbol.dispose]?.();
            if (isActive && !canDecode) failProxyPlayback(clip.mediaId, mediaItem.blob);
            return;
          }

          // Ensure canvas has valid dimensions BEFORE creating CanvasSink
          if (canvas.width === 0 || canvas.height === 0) {
            console.warn(
              "[Preview] Canvas has zero dimensions, setting from project settings",
            );
            canvas.width = previewRes.width;
            canvas.height = previewRes.height;
          }

          const sink = new CanvasSink(videoTrack, {
            poolSize: 3,
          });

          const speedEngine = getSpeedEngine();
          const clipLocalTime = Math.max(0, timelinePosition - clip.startTime);

          let currentSpeed = speedEngine.getClipSpeed(clip.id);
          let isReverse = speedEngine.isReverse(clip.id);
          let speedSourceClip = clip.id;

          // If video clip has default speed, check for linked audio clip's speed
          if (currentSpeed === 1 && !isReverse) {
            const tracks = timelineTracksRef.current;
            const audioTracks = tracks;

            for (const audioTrack of audioTracks) {
              for (const audioClip of audioTrack.clips) {
                if (
                  mediaClipHasAudio(audioClip) &&
                  audioClip.mediaId === clip.mediaId &&
                  Math.abs(audioClip.startTime - clip.startTime) < 0.01
                ) {
                  const linkedSpeed = speedEngine.getClipSpeed(audioClip.id);
                  const linkedReverse = speedEngine.isReverse(audioClip.id);

                  if (linkedSpeed !== 1 || linkedReverse) {
                    currentSpeed = linkedSpeed;
                    isReverse = linkedReverse;
                    speedSourceClip = audioClip.id;
                    break;
                  }
                }
              }
              if (currentSpeed !== 1 || isReverse) break;
            }
          }

          const adjustedLocalTime = speedEngine.getSourceTimeAtPlaybackTime(
            speedSourceClip,
            clipLocalTime,
          );
          const mediaStartTime = (clip.inPoint || 0) + adjustedLocalTime;

          const mediaEndTime = Math.min(
            clip.outPoint || (clip.inPoint || 0) + clip.duration,
            (await videoTrack.computeDuration()) || Infinity,
          );

          await setupAudioFromAudioTrack(timelinePosition);

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            console.error("[Preview] Failed to get 2D context from canvas");
            input[Symbol.dispose]?.();
            return;
          }

          const frameDuration = editingFrameDuration;

          let currentMediaTime = mediaStartTime;
          let currentPlayheadTime = timelinePosition;
          let lastFrameTimestamp = performance.now();
          const processNextFrame = async () => {
            if (!isActive) {
              input[Symbol.dispose]?.();
              return;
            }

            try {
              if (currentMediaTime >= mediaEndTime) {
                input[Symbol.dispose]?.();
                cleanupAudioResources();

                const clipEndTime = clip.startTime + clip.duration;
                const nextResult = findClipAtTime(clipEndTime);

                if (nextResult && clipEndTime < actualEndTime && isActive) {
                  setPlayheadPosition(clipEndTime);
                  _startPlaybackForClip(
                    nextResult.clip,
                    nextResult.track,
                    clipEndTime,
                  );
                } else if (!isScrubbingRef.current) {
                  setPlayheadPosition(0);
                  startPositionRef.current = 0;
                  pause();
                }
                return;
              }

              const frameResult = await (
                sink as {
                  getCanvas: (time: number) => Promise<{
                    canvas: HTMLCanvasElement | OffscreenCanvas;
                    timestamp: number;
                    duration: number;
                  } | null>;
                }
              ).getCanvas(currentMediaTime);

              if (!frameResult || !frameResult.canvas) {
                console.warn("[Preview] No frame at time", currentMediaTime);
                const skipTime = frameDuration / 1000;
                currentPlayheadTime += skipTime;
                currentMediaTime += skipTime * currentSpeed;
                if (isActive) {
                  animationRef.current =
                    requestAnimationFrame(processNextFrame);
                }
                return;
              }

              const { canvas: frameCanvas, duration } = frameResult;

              const frameWidth = "width" in frameCanvas ? frameCanvas.width : 0;
              const frameHeight =
                "height" in frameCanvas ? frameCanvas.height : 0;
              if (frameWidth === 0 || frameHeight === 0) {
                console.warn("[Preview] Frame has zero dimensions, skipping");
                const skipTime = frameDuration / 1000;
                currentPlayheadTime += skipTime;
                currentMediaTime += skipTime * currentSpeed;
                if (isActive) {
                  animationRef.current =
                    requestAnimationFrame(processNextFrame);
                }
                return;
              }

              const currentPlayhead = currentPlayheadTime;

              if (currentPlayhead >= actualEndTime) {
                if (!isScrubbingRef.current) {
                  setPlayheadPosition(0);
                  startPositionRef.current = 0;
                  pause();
                }
                input[Symbol.dispose]?.();
                return;
              }

              const clipLocalTime = currentPlayhead - clip.startTime;
              let transform = scaleTransformPositionForPreview(
                getAnimatedTransform(
                  (clip.transform as ClipTransform) || DEFAULT_TRANSFORM,
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
                transform = {
                  ...transform,
                  opacity: transform.opacity * emphasisState.opacity,
                  scale: {
                    x:
                      transform.scale.x *
                      emphasisState.scale *
                      emphasisState.scaleX,
                    y:
                      transform.scale.y *
                      emphasisState.scale *
                      emphasisState.scaleY,
                  },
                  position: {
                    x:
                      transform.position.x +
                      emphasisState.offsetX * canvas.width,
                    y:
                      transform.position.y +
                      emphasisState.offsetY * canvas.height,
                  },
                  rotation: transform.rotation + emphasisState.rotation,
                };
              }

              const useGPU =
                rendererRef.current &&
                rendererRef.current.type === "webgpu" &&
                !clipMasksById.has(clip.id);
              const preparedFrame = await preparePreviewFrame(
                clip.id,
                frameCanvas,
                Boolean(useGPU),
                true,
              );
              const stabilizedTransform = applyStabilizationTransform(
                clip,
                transform,
                currentMediaTime,
                canvas.width,
                canvas.height,
                preparedFrame.frame.width,
                preparedFrame.frame.height,
              );

              fillPreviewBackground(
                ctx,
                playheadPositionRef.current,
                canvas.width,
                canvas.height,
              );
              if (
                canvasFillModeRef.current === "blur" &&
                frameWidth > 0 &&
                frameHeight > 0
              ) {
                drawBlurredBackdrop(
                  ctx,
                  frameCanvas,
                  frameWidth,
                  frameHeight,
                  canvas.width,
                  canvas.height,
                );
              }
              if (useGPU && preparedFrame.frame instanceof ImageBitmap) {
                const gpuResult = await renderFrameWithGPU(
                  rendererRef.current!,
                  preparedFrame.frame,
                  stabilizedTransform,
                  canvas.width,
                  canvas.height,
                );
                if (gpuResult) {
                  ctx.drawImage(gpuResult, 0, 0, canvas.width, canvas.height);
                  gpuResult.close();
                } else {
                  await drawClipFrame(
                    ctx,
                    clip.id,
                    preparedFrame.frame,
                    stabilizedTransform,
                    canvas.width,
                    canvas.height,
                    currentPlayhead,
                  );
                }
              } else {
                await drawClipFrame(
                  ctx,
                  clip.id,
                  preparedFrame.frame,
                  stabilizedTransform,
                  canvas.width,
                  canvas.height,
                  currentPlayhead,
                );
              }
              preparedFrame.cleanup();

              const nowPh = performance.now();
              if (nowPh - lastPlayheadUpdateRef.current >= editingFrameDuration) {
                lastPlayheadUpdateRef.current = nowPh;
                setPlayheadPosition(currentPlayhead);
              }

              const now = performance.now();
              const elapsed = now - lastFrameTimestamp;
              const actualFrameDuration =
                duration > 0 ? duration * 1000 : frameDuration;
              const targetTime = actualFrameDuration / rateRef.current;

              const normalTimeAdvance = actualFrameDuration / 1000;
              const mediaTimeAdvance = normalTimeAdvance * currentSpeed;
              currentPlayheadTime += normalTimeAdvance;
              currentMediaTime += mediaTimeAdvance;

              const delay = Math.max(0, targetTime - elapsed);
              lastFrameTimestamp = now;

              if (isActive) {
                if (delay > 0) {
                  setTimeout(() => {
                    if (isActive) {
                      animationRef.current =
                        requestAnimationFrame(processNextFrame);
                    }
                  }, delay);
                } else {
                  animationRef.current =
                    requestAnimationFrame(processNextFrame);
                }
              }
            } catch (error) {
              console.error("[Preview] Frame error:", error);
              input[Symbol.dispose]?.();
              pause();
            }
          };

          animationRef.current = requestAnimationFrame(processNextFrame);
        } catch (error) {
          console.error("[Preview] MediaBunny setup error:", error);
          if (!isActive) return;
          if (mediaItem.blob !== getOriginalMediaItem(clip.mediaId)?.blob) {
            failProxyPlayback(clip.mediaId, mediaItem.blob);
          } else {
            pause();
          }
        }
      } catch (outerError) {
        console.error(
          "[Preview] startPlaybackForClip outer error:",
          outerError,
        );
        pause();
      }
    };

    const initClipResourcesForPlayback = (
      clip: (typeof timelineTracksRef.current)[0]["clips"][0],
      trackIndex: number,
    ) =>
      initClipResources(clip, trackIndex, () => isActive, {
        getMediaItem,
        failProxyPlayback,
      });
    const cachePlaybackImages = () =>
      preCacheAllImageBitmaps(refs, timelineTracksRef.current, getMediaItem);

    const startMultiTrackPlayback = async () => {
      const initialClips = findAllClipsAtTime(playbackStartPosition);
      const activeTextClips = getActiveTextClips(
        allTextClipsRef.current,
        playbackStartPosition,
      );
      const activeShapeClips = getActiveShapeClips(
        allShapeClipsRef.current,
        playbackStartPosition,
      );

      const audioTracks = timelineTracksRef.current.filter(
        (track) => !track.hidden,
      );
      const hasActiveAudioClip = audioTracks.some((track) =>
        track.clips.some(
          (clip) =>
            mediaClipHasAudio(clip) &&
            playbackStartPosition >= clip.startTime &&
            playbackStartPosition < clip.startTime + clip.duration,
        ),
      );

      const hasAnyVisualContent =
        initialClips.length > 0 ||
        activeTextClips.length > 0 ||
        activeShapeClips.length > 0 ||
        hasActiveMotionInstances(playbackStartPosition);
      const hasAnyContent = hasAnyVisualContent || hasActiveAudioClip;

      if (!hasAnyContent && actualEndTime <= 0) {
        pause();
        return;
      }

      cachePlaybackImages().catch((error) => {
        console.warn("[Preview] Image warmup failed:", error);
      });

      for (const { clip, trackIndex } of initialClips) {
        if (!playbackResourcesRef.current.has(clip.id)) {
          const resources = await initClipResourcesForPlayback(clip, trackIndex);
          if (resources) {
            playbackResourcesRef.current.set(clip.id, resources);
          }
        }
      }

      const hasTextOrShapeContent =
        activeTextClips.length > 0 ||
        activeShapeClips.length > 0 ||
        hasActiveMotionInstances(playbackStartPosition);
      if (
        playbackResourcesRef.current.size === 0 &&
        !hasTextOrShapeContent &&
        !hasActiveAudioClip &&
        actualEndTime <= 0
      ) {
        pause();
        return;
      }

      preDecodeAllAudioBuffers().catch((error) => {
        console.warn("[Preview] Audio warmup failed:", error);
      });

      if (!audioGraphRef.current) {
        audioGraphRef.current = getRealtimeAudioGraph();
      }
      const audioGraph = audioGraphRef.current;
      audioGraph.setPreviewMuted(isMuted);

      const tracksWithAudio = timelineTracksRef.current.filter(
        (track) => !track.hidden && trackHasAudioItems(project, track.id),
      );
      for (const track of tracksWithAudio) {
        audioGraph.createTrack({
          trackId: track.id,
          volume: 1,
          pan: 0,
          muted: track.muted || false,
          solo: track.solo || false,
          effects: [],
        });
      }

      await audioGraph.resume();

      const mainCtx = canvas.getContext("2d");
      if (!mainCtx) {
        console.error("[Preview] Failed to get 2D context");
        pause();
        return;
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

      const ctx = offscreenCtxRef.current as unknown as CanvasRenderingContext2D;
      if (!ctx) {
        console.error("[Preview] Failed to get offscreen 2D context");
        pause();
        return;
      }

      const masterClock = getMasterClock();
      masterClock.setDuration(actualEndTime);
      masterClock.seek(playbackStartPosition);

      audioGraph.seekTo(playbackStartPosition);
      await masterClock.play();
      audioGraph.startScheduler(getAudioClipsForScheduler);

      const frameDuration = editingFrameDuration;
      const multiTrackState: MultiTrackPlaybackState = {
        lastFrameTimestamp: performance.now(),
        isProcessingFrame: false,
      };

      const processMultiTrackFrame = async () => {
        if (!isActive) {
          cleanupPlaybackResources();
          masterClock.pause();
          return;
        }

        if (multiTrackState.isProcessingFrame) {
          return;
        }
        multiTrackState.isProcessingFrame = true;

        const currentPlayhead = masterClock.currentTime;

        try {
          if (currentPlayhead >= actualEndTime) {
            multiTrackState.isProcessingFrame = false;
            cleanupPlaybackResources();
            cleanupAudioResources();
            masterClock.stop();
            setPlayheadPosition(0);
            startPositionRef.current = 0;
            pause();
            return;
          }

          if (!masterClock.isPlaying) {
            multiTrackState.isProcessingFrame = false;
            cleanupPlaybackResources();
            cleanupAudioResources();
            if (!isScrubbingRef.current) {
              pause();
            }
            return;
          }

          // Keep the timeline UI clock-aligned with audio even when decoding or
          // effects make the current visual frame expensive to produce.
          const nowPlayhead = performance.now();
          if (nowPlayhead - lastPlayheadUpdateRef.current >= editingFrameDuration) {
            lastPlayheadUpdateRef.current = nowPlayhead;
            setPlayheadPosition(currentPlayhead);
          }

          const activeClips = findAllClipsAtTime(currentPlayhead);
          const currentTextClips = getActiveTextClips(
            allTextClipsRef.current,
            currentPlayhead,
          );
          const currentShapeClips = getActiveShapeClips(
            allShapeClipsRef.current,
            currentPlayhead,
          );

          const audioTracksForFrame = timelineTracksRef.current.filter(
            (track) => !track.hidden,
          );
          const hasCurrentAudioClip = audioTracksForFrame.some((track) =>
            track.clips.some(
              (clip) =>
                mediaClipHasAudio(clip) &&
                currentPlayhead >= clip.startTime &&
                currentPlayhead < clip.startTime + clip.duration,
            ),
          );

          const hasVisualContent =
            activeClips.length > 0 ||
            currentTextClips.length > 0 ||
            currentShapeClips.length > 0 ||
            hasActiveMotionInstances(currentPlayhead);
          const hasAnyContentAtPlayhead =
            hasVisualContent || hasCurrentAudioClip;

          if (!hasAnyContentAtPlayhead) {
            if (resolvePlaybackLoop(useTimelineStore.getState(), actualEndTime)) {
              // Preserve empty portions of the marked range while looping.
              // Skipping to later content could jump beyond the loop's out point.
              fillPreviewBackground(mainCtx, currentPlayhead, canvas.width, canvas.height);
              masterClock.reportVideoTime(currentPlayhead);
              multiTrackState.isProcessingFrame = false;
              animationRef.current = requestAnimationFrame(processMultiTrackFrame);
              return;
            }
            const nextClipTime = findNextClipStartTime(currentPlayhead);
            const nextTextTime = findNextTextClipStartTime(currentPlayhead);
            const nextShapeTime = findNextShapeClipStartTime(currentPlayhead);
            const nextMotionTime = findNextMotionInstanceStartTime(currentPlayhead);
            const nextAudioTime = findNextAudioClipStartTime(currentPlayhead);

            const nextTimes = [
              nextClipTime,
              nextTextTime,
              nextShapeTime,
              nextMotionTime,
              nextAudioTime,
            ].filter((t): t is number => t !== null && t < actualEndTime);
            const nextTime =
              nextTimes.length > 0 ? Math.min(...nextTimes) : null;

            if (nextTime !== null) {
              masterClock.seek(nextTime);
              audioGraph.seekTo(nextTime);
              multiTrackState.isProcessingFrame = false;
              animationRef.current = requestAnimationFrame(
                processMultiTrackFrame,
              );
              return;
            } else {
              multiTrackState.isProcessingFrame = false;
              cleanupPlaybackResources();
              cleanupAudioResources();
              if (!isScrubbingRef.current) {
                masterClock.stop();
                setPlayheadPosition(0);
                startPositionRef.current = 0;
                pause();
              }
              return;
            }
          }

          const hasActiveCompound = activeClips.some(
            ({ clip }) => typeof clip.metadata?.compoundClipId === "string",
          );
          if (hasActiveCompound) {
            await renderFrameDirectlyRef.current(currentPlayhead);
            masterClock.reportVideoTime(currentPlayhead);
            const now = performance.now();
            const elapsed = now - multiTrackState.lastFrameTimestamp;
            const delay = Math.max(0, frameDuration / rateRef.current - elapsed);
            multiTrackState.lastFrameTimestamp = now;
            multiTrackState.isProcessingFrame = false;
            if (isActive) {
              if (delay > 0) {
                setTimeout(() => {
                  if (isActive) animationRef.current = requestAnimationFrame(processMultiTrackFrame);
                }, delay);
              } else {
                animationRef.current = requestAnimationFrame(processMultiTrackFrame);
              }
            }
            return;
          }

          for (const { clip, trackIndex } of activeClips) {
            if (!playbackResourcesRef.current.has(clip.id)) {
              const resources = await initClipResourcesForPlayback(clip, trackIndex);
              if (resources) {
                playbackResourcesRef.current.set(clip.id, resources);
              }
            }
          }

          // Active transition takes over the whole frame: decode both clips
          // (one will be outside its visible window — its sink will clamp to
          // the nearest edge frame) and blend them. Overlays still render on
          // top below.
          const transitionInfoMulti = getTransitionAtTime(
            currentPlayhead,
            timelineTracksRef.current,
            mediaClipHasVisual,
          );

          // Compute these here so they're visible in both the transition path
          // and the normal compositing path below.
          const activeShapeClips = getActiveShapeClips(
            allShapeClipsRef.current,
            currentPlayhead,
          );
          const activeTextClips = getActiveTextClips(
            allTextClipsRef.current,
            currentPlayhead,
          );

          if (transitionInfoMulti) {
            const tracks = timelineTracksRef.current;
            const findClipById = (id: string) => {
              for (let idx = 0; idx < tracks.length; idx++) {
                const found = tracks[idx].clips.find((c) => c.id === id);
                if (found) return { clip: found, trackIndex: idx };
              }
              return null;
            };

            const aLookup = findClipById(transitionInfoMulti.clipA.id);
            const bLookup = transitionInfoMulti.clipB
              ? findClipById(transitionInfoMulti.clipB.id)
              : null;

            if (aLookup && (!transitionInfoMulti.clipB || bLookup)) {
              const lookups = bLookup ? [aLookup, bLookup] : [aLookup];
              for (const lookup of lookups) {
                if (!playbackResourcesRef.current.has(lookup.clip.id)) {
                  const resources = await initClipResourcesForPlayback(
                    lookup.clip,
                    lookup.trackIndex,
                  );
                  if (resources) {
                    playbackResourcesRef.current.set(
                      lookup.clip.id,
                      resources,
                    );
                  }
                }
              }

              const decodeClipFrameForTransition = async (
                clip: (typeof tracks)[0]["clips"][0],
              ): Promise<HTMLCanvasElement | OffscreenCanvas | null> => {
                const resources = playbackResourcesRef.current.get(clip.id);
                if (!resources) return null;
                const speedEngine = getSpeedEngine();
                const localTime = currentPlayhead - clip.startTime;
                const adjustedLocalTime =
                  speedEngine.getSourceTimeAtPlaybackTime(clip.id, localTime);
                const sourceTime = Math.max(
                  clip.inPoint,
                  Math.min(
                    clip.outPoint,
                    (clip.inPoint || 0) + adjustedLocalTime,
                  ),
                );
                try {
                  const result = await (
                    resources.sink as {
                      getCanvas: (time: number) => Promise<{
                        canvas: HTMLCanvasElement | OffscreenCanvas;
                      } | null>;
                    }
                  ).getCanvas(sourceTime);
                  if (!result?.canvas) return null;
                  return result.canvas;
                } catch (error) {
                  console.warn(
                    `[Preview] Transition decode failed for clip ${clip.id}:`,
                    error,
                  );
                  return null;
                }
              };

              const [clipAFrame, clipBFrame] = await Promise.all([
                decodeClipFrameForTransition(aLookup.clip),
                bLookup
                  ? decodeClipFrameForTransition(bLookup.clip)
                  : Promise.resolve(null),
              ]);

              const blank = transitionInfoMulti.clipB
                ? null
                : createTransparentCanvasSource(canvas.width, canvas.height);
              const outgoing =
                transitionInfoMulti.clipB || transitionInfoMulti.edge !== "in"
                  ? clipAFrame
                  : blank;
              const incoming = transitionInfoMulti.clipB
                ? clipBFrame
                : transitionInfoMulti.edge === "in"
                  ? clipAFrame
                  : blank;

              if (outgoing && incoming) {
                try {
                  const blended = await renderTransitionCanvas(
                    transitionInfoMulti,
                    outgoing,
                    incoming,
                  );

                  fillPreviewBackground(
                    ctx,
                    playheadPositionRef.current,
                    canvas.width,
                    canvas.height,
                  );
                  ctx.drawImage(blended, 0, 0, canvas.width, canvas.height);

                  const transitionSubjectFrame = hasBehindSubjectText(
                    activeTextClips,
                  )
                    ? await captureSubjectFrame(
                        ctx,
                        canvas.width,
                        canvas.height,
                      )
                    : null;
                  try {
                    for (const shapeClip of activeShapeClips) {
                      await renderShapeClipWithEffects(
                        ctx,
                        shapeClip,
                        canvas.width,
                        canvas.height,
                        currentPlayhead,
                      );
                    }
                    for (const textClip of activeTextClips) {
                      await renderTextClipWithSubjectMask(
                        ctx,
                        textClip,
                        canvas.width,
                        canvas.height,
                        currentPlayhead,
                        transitionSubjectFrame,
                        true,
                        getBehindSubjectStreamId(
                          timelineTracksRef.current,
                          currentPlayhead,
                          getMediaItem,
                        ),
                      );
                    }
                  } finally {
                    transitionSubjectFrame?.close();
                  }
                  const activeSubtitlesTr = getActiveSubtitles(
                    allSubtitlesRef.current,
                    currentPlayhead,
                  );
                  for (const subtitle of activeSubtitlesTr) {
                    renderSubtitleToCanvas(
                      ctx,
                      subtitle,
                      canvas.width,
                      canvas.height,
                      currentPlayhead,
                    );
                  }

                  mainCtx.drawImage(offscreenCanvasRef.current!, 0, 0);

                  masterClock.reportVideoTime(currentPlayhead);
                  const nowTr = performance.now();
                  if (
                    nowTr - lastPlayheadUpdateRef.current >=
                    editingFrameDuration
                  ) {
                    lastPlayheadUpdateRef.current = nowTr;
                    setPlayheadPosition(currentPlayhead);
                  }
                  const elapsedTr = nowTr - multiTrackState.lastFrameTimestamp;
                  const targetTimeTr = frameDuration / rateRef.current;
                  const delayTr = Math.max(0, targetTimeTr - elapsedTr);
                  multiTrackState.lastFrameTimestamp = nowTr;
                  multiTrackState.isProcessingFrame = false;
                  if (isActive) {
                    if (delayTr > 0) {
                      setTimeout(() => {
                        if (isActive) {
                          animationRef.current = requestAnimationFrame(
                            processMultiTrackFrame,
                          );
                        }
                      }, delayTr);
                    } else {
                      animationRef.current = requestAnimationFrame(
                        processMultiTrackFrame,
                      );
                    }
                  }
                  return;
                } catch (error) {
                  console.warn(
                    "[Preview] Transition render failed, falling back to normal compositing:",
                    error,
                  );
                }
              }
            }
          }

          const activeClipIds = new Set(activeClips.map((c) => c.clip.id));
          for (const [clipId, resources] of playbackResourcesRef.current) {
            if (!activeClipIds.has(clipId)) {
              resources.input[Symbol.dispose]?.();
              playbackResourcesRef.current.delete(clipId);
            }
          }

          const sortedClips = [...activeClips].sort(
            (a, b) => b.trackIndex - a.trackIndex,
          );
          const activeTextNeedsSubject = hasBehindSubjectText(activeTextClips);
          const useGPUFrames =
            rendererRef.current?.type === "webgpu" && !activeTextNeedsSubject;

          const imageClipFrames: Array<{
            clip: (typeof sortedClips)[0]["clip"];
            transform: ClipTransform;
            frame: ImageBitmap;
          }> = [];

          const videoClipPromises: Array<
            Promise<{
              clip: (typeof sortedClips)[0]["clip"];
              transform: ClipTransform;
              frame: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
              cleanup: () => void;
            } | null>
          > = [];

          for (const { clip } of sortedClips) {
            if (!isActive) continue;

            const clipLocalTime = currentPlayhead - clip.startTime;

            let transform = scaleTransformPositionForPreview(
              getAnimatedTransform(
                (clip.transform as ClipTransform) || DEFAULT_TRANSFORM,
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
              transform = {
                ...transform,
                opacity: transform.opacity * emphasisState.opacity,
                scale: {
                  x:
                    transform.scale.x *
                    emphasisState.scale *
                    emphasisState.scaleX,
                  y:
                    transform.scale.y *
                    emphasisState.scale *
                    emphasisState.scaleY,
                },
                position: {
                  x:
                    transform.position.x + emphasisState.offsetX * canvas.width,
                  y:
                    transform.position.y +
                    emphasisState.offsetY * canvas.height,
                },
                rotation: transform.rotation + emphasisState.rotation,
              };
            }

            const clipMedia = getMediaItem(clip.mediaId);
            if (clipMedia?.type === "image") {
              let cachedBitmap = imageBitmapCacheRef.current.get(clip.id);
              if (
                !cachedBitmap &&
                clipMedia?.type === "image" &&
                clipMedia.blob instanceof Blob &&
                !failedImageDecodesRef.current.has(clip.id)
              ) {
                try {
                  cachedBitmap = await createImageBitmap(clipMedia.blob);
                  imageBitmapCacheRef.current.set(clip.id, cachedBitmap);
                } catch (error) {
                  failedImageDecodesRef.current.add(clip.id);
                  console.warn(
                    `[Preview] On-demand image decode failed for clip ${clip.id}:`,
                    error,
                  );
                }
              }
              if (cachedBitmap) {
                imageClipFrames.push({ clip, transform, frame: cachedBitmap });
              }
              continue;
            }

            videoClipPromises.push(
              (async () => {
                const resources = playbackResourcesRef.current.get(clip.id);
                if (!resources) return null;

                const speedEngine = getSpeedEngine();
                const adjustedLocalTime =
                  speedEngine.getSourceTimeAtPlaybackTime(
                    clip.id,
                    clipLocalTime,
                  );
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

                  if (!isActive) return null;

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
                  const errorMessage =
                    error instanceof Error ? error.message : String(error);
                  if (errorMessage.includes("disposed") || !isActive) {
                    return null;
                  }
                  console.warn(
                    `[Preview] Failed to get frame for clip ${clip.id}:`,
                    error,
                  );
                }
                return null;
              })(),
            );
          }

          const videoFrameResults = await Promise.all(videoClipPromises);
          const validVideoFrames = videoFrameResults.filter(
            (f): f is NonNullable<typeof f> => f !== null,
          );

          const validFrames = [...imageClipFrames, ...validVideoFrames];

          if (
            validFrames.length > 0 ||
            currentTextClips.length > 0 ||
            currentShapeClips.length > 0 ||
            hasActiveMotionInstances(currentPlayhead)
          ) {
            fillPreviewBackground(
              ctx,
              playheadPositionRef.current,
              canvas.width,
              canvas.height,
            );

            const tracks = timelineTracksRef.current;

            const clipToTrackIndex = new Map<string, number>();
            tracks.forEach((track, idx) => {
              if (!track.hidden) {
                for (const clip of track.clips) {
                  if (mediaClipHasVisual(clip)) {
                    clipToTrackIndex.set(clip.id, idx);
                  }
                }
              }
            });

            const allRenderableTracks = getVisibleTrackRenderOrder(tracks);

            if (canvasFillModeRef.current === "blur") {
              for (const { originalIndex } of allRenderableTracks) {
                const baseFrame = validFrames.find(
                  (f) => clipToTrackIndex.get(f.clip.id) === originalIndex,
                );
                if (
                  baseFrame &&
                  baseFrame.frame.width > 0 &&
                  baseFrame.frame.height > 0
                ) {
                  drawBlurredBackdrop(
                    ctx,
                    baseFrame.frame,
                    baseFrame.frame.width,
                    baseFrame.frame.height,
                    canvas.width,
                    canvas.height,
                  );
                  break;
                }
              }
            }

            const useGPU =
              rendererRef.current &&
              rendererRef.current.type === "webgpu" &&
              !activeTextNeedsSubject &&
              currentTextClips.length === 0 &&
              currentShapeClips.length === 0 &&
              !hasActiveMotionInstances(currentPlayhead) &&
              !validFrames.some(({ clip }) => clipMasksById.has(clip.id));

            if (useGPU) {
              const gpuLayers: GPULayer[] = [];
              const tempBitmaps: ImageBitmap[] = [];

              for (const { originalIndex } of allRenderableTracks) {
                const trackFrames = validFrames.filter(
                  (frame) =>
                    clipToTrackIndex.get(frame.clip.id) === originalIndex,
                );
                for (const { transform, frame } of trackFrames) {
                  if (frame instanceof ImageBitmap) {
                    gpuLayers.push({
                      bitmap: frame,
                      transform,
                    });
                  } else {
                    const bitmap = await createImageBitmap(frame);
                    tempBitmaps.push(bitmap);
                    gpuLayers.push({ bitmap, transform });
                  }
                }
              }

              if (gpuLayers.length > 0) {
                const gpuResult = await renderAllLayersWithGPU(
                  rendererRef.current!,
                  gpuLayers,
                  canvas.width,
                  canvas.height,
                );
                if (gpuResult) {
                  ctx.drawImage(gpuResult, 0, 0, canvas.width, canvas.height);
                  gpuResult.close();
                } else {
                  for (const layer of gpuLayers) {
                    drawFrameWithTransform(
                      ctx,
                      layer.bitmap,
                      layer.transform,
                      canvas.width,
                      canvas.height,
                    );
                  }
                }
              }

              for (const bitmap of tempBitmaps) {
                bitmap.close();
              }
            } else {
              let subjectFrame: ImageBitmap | null = null;
              for (const { track, originalIndex } of allRenderableTracks) {
                const trackFrames = validFrames.filter(
                  (frame) =>
                    clipToTrackIndex.get(frame.clip.id) === originalIndex,
                );
                for (const { clip, transform, frame } of trackFrames) {
                  await drawClipFrame(
                    ctx,
                    clip.id,
                    frame,
                    transform,
                    canvas.width,
                    canvas.height,
                    currentPlayhead,
                  );
                  if (activeTextNeedsSubject) {
                    subjectFrame?.close();
                    subjectFrame = await captureSubjectFrame(
                      ctx,
                      canvas.width,
                      canvas.height,
                    );
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
                    currentPlayhead,
                  );
                }
                await renderMotionInstancesForTrack(
                  ctx,
                  track,
                  currentPlayhead,
                  canvas.width,
                  canvas.height,
                );
                const trackTextClips = activeTextClips.filter(
                  (clip) => clip.trackId === track.id,
                );
                for (const textClip of trackTextClips) {
                  await renderTextClipWithSubjectMask(
                    ctx,
                    textClip,
                    canvas.width,
                    canvas.height,
                    currentPlayhead,
                    subjectFrame,
                    true,
                    getBehindSubjectStreamId(
                      timelineTracksRef.current,
                      currentPlayhead,
                      getMediaItem,
                    ),
                  );
                }
              }
              subjectFrame?.close();
            }

            for (const frame of validVideoFrames) {
              frame.cleanup();
            }

            const activeSubtitles = getActiveSubtitles(
              allSubtitlesRef.current,
              currentPlayhead,
            );
            for (const subtitle of activeSubtitles) {
              renderSubtitleToCanvas(
                ctx,
                subtitle,
                canvas.width,
                canvas.height,
                currentPlayhead,
              );
            }

            mainCtx.drawImage(offscreenCanvasRef.current!, 0, 0);

            try {
              lastGoodFrameRef.current?.close();
              lastGoodFrameRef.current = await createImageBitmap(offscreenCanvasRef.current!);
            } catch {
              // Snapshot failures are recoverable; keep the already-rendered frame.
            }
          } else if (lastGoodFrameRef.current) {
            ctx.drawImage(
              lastGoodFrameRef.current,
              0,
              0,
              canvas.width,
              canvas.height,
            );

            const activeSubtitles = getActiveSubtitles(
              allSubtitlesRef.current,
              currentPlayhead,
            );
            for (const subtitle of activeSubtitles) {
              renderSubtitleToCanvas(
                ctx,
                subtitle,
                canvas.width,
                canvas.height,
                currentPlayhead,
              );
            }

            mainCtx.drawImage(offscreenCanvasRef.current!, 0, 0);
          }

          masterClock.reportVideoTime(currentPlayhead);
          const now = performance.now();
          const elapsed = now - multiTrackState.lastFrameTimestamp;
          const targetTime = frameDuration / rateRef.current;

          const delay = Math.max(0, targetTime - elapsed);
          multiTrackState.lastFrameTimestamp = now;

          multiTrackState.isProcessingFrame = false;

          if (isActive) {
            if (delay > 0) {
              setTimeout(() => {
                if (isActive) {
                  animationRef.current = requestAnimationFrame(
                    processMultiTrackFrame,
                  );
                }
              }, delay);
            } else {
              animationRef.current = requestAnimationFrame(
                processMultiTrackFrame,
              );
            }
          }
        } catch (error) {
          multiTrackState.isProcessingFrame = false;
          console.error("[Preview] Multi-track frame error:", error);
          cleanupPlaybackResources();
          pause();
        }
      };

      animationRef.current = requestAnimationFrame(processMultiTrackFrame);
    };

    const findNextClipStartTime = (afterTime: number): number | null => {
      return selectNextClipStartTime(
        timelineTracksRef.current,
        afterTime,
        mediaClipHasVisual,
      );
    };

    const findNextTextClipStartTime = (afterTime: number): number | null => {
      const textClips = allTextClipsRef.current;
      let nextStart: number | null = null;

      for (const clip of textClips) {
        if (clip.startTime > afterTime) {
          if (nextStart === null || clip.startTime < nextStart) {
            nextStart = clip.startTime;
          }
        }
      }

      return nextStart;
    };

    const findNextShapeClipStartTime = (afterTime: number): number | null => {
      const shapeClips = allShapeClipsRef.current;
      let nextStart: number | null = null;

      for (const clip of shapeClips) {
        if (clip.startTime > afterTime) {
          if (nextStart === null || clip.startTime < nextStart) {
            nextStart = clip.startTime;
          }
        }
      }

      return nextStart;
    };

    const findNextMotionInstanceStartTime = (afterTime: number): number | null => {
      let nextStart: number | null = null;
      for (const instance of project.motionInstances ?? []) {
        if (instance.startTime > afterTime) {
          if (nextStart === null || instance.startTime < nextStart) {
            nextStart = instance.startTime;
          }
        }
      }
      return nextStart;
    };

    const findNextAudioClipStartTime = (afterTime: number): number | null => {
      const tracks = timelineTracksRef.current;
      const audioTracks = tracks.filter((track) => !track.hidden);
      let nextStart: number | null = null;

      for (const track of audioTracks) {
        for (const clip of track.clips) {
          if (mediaClipHasAudio(clip) && clip.startTime > afterTime) {
            if (nextStart === null || clip.startTime < nextStart) {
              nextStart = clip.startTime;
            }
          }
        }
      }

      return nextStart;
    };

    const startPlayback = async () => {
      const nativeCheck = canUseNativeVideoPlayback(playbackStartPosition);

      if (nativeCheck.canUse && nativeCheck.clips.length > 0) {
        try {
          nativeCleanup = await startNativeVideoPlayback(
            nativeCheck.clips,
            nativeCheck.imageClips || [],
            playbackStartPosition,
            () => pause(),
            () => isActive && previewProxyCache.store.getState().revision === proxySourceRevision,
          );
          return nativeCleanup;
        } catch (error) {
          console.warn(
            "[Preview] Native video playback failed, falling back to MediaBunny:",
            error,
          );
        }
      }
      await startMultiTrackPlayback();
    };

    startPlayback().catch((error) => {
      console.error("[Preview] startPlayback error:", error);
    });

    return () => {
      isActive = false;
      nativePlaybackActiveRef.current = false;
      const masterClock = getMasterClock();
      if (masterClock.isPlaying || masterClock.isPaused) {
        startPositionRef.current = masterClock.currentTime;
      }
      if (nativeCleanup) {
        const pausedForResume =
          useTimelineStore.getState().playbackState === "paused";
        nativeCleanup(pausedForResume);
        nativeCleanup = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
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
      masterClock.pause();
      cleanupAudioResources();
    };
  }, [
    isPlaying,
    canUseNativeVideoPlayback,
    startNativeVideoPlayback,
    actualEndTime,
    setPlayheadPosition,
    pause,
    getMediaItem,
    getOriginalMediaItem,
    failProxyPlayback,
    proxySourceRevision,
    cleanupPlaybackResources,
    cleanupAudioResources,
    setupAudioFromAudioTrack,
    preDecodeAllAudioBuffers,
    getAudioClipsForScheduler,
    isMuted,
    previewRes.width,
    previewRes.height,
    previewRes.scale,
    editingFrameDuration,
    hasActiveMotionInstances,
    renderMotionInstancesForTrack,
    project,
    mediaClipHasAudio,
    mediaClipHasVisual,
    clipMasksById,
    drawClipFrame,
    fillPreviewBackground,
  ]);

  useEffect(() => {
    if (isPlaying) return;

    if (isInteractingRef.current) {
      lastProjectForRenderRef.current = project;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const playheadChanged = playheadPosition !== lastPlayheadForRenderRef.current;
    const projectChanged = project !== lastProjectForRenderRef.current;
    const sourceChanged = proxySourceRevision !== lastProxyRevisionForRenderRef.current;

    lastProjectForRenderRef.current = project;
    lastProxyRevisionForRenderRef.current = proxySourceRevision;
    lastPlayheadForRenderRef.current = playheadPosition;

    const previousRenderTime = lastPreviewRenderTimeRef.current;
    const isLargeJump =
      Math.abs(playheadPosition - previousRenderTime) > 1 ||
      playheadPosition < previousRenderTime - 0.25;
    if (isLargeJump) {
      releaseScrubVideoElements();
    }
    lastPreviewRenderTimeRef.current = playheadPosition;

    const doRender = async (time: number) => {
      if (renderInFlightRef.current) {
        // Coalesce: remember the latest requested position and render it
        // once the current render completes. This is what makes scrubbing
        // feel responsive even when each render is slower than mouse moves.
        pendingRenderTimeRef.current = time;
        return;
      }
      renderInFlightRef.current = true;
      try {
        const rendered = await renderFrameDirectly(time);
        if (!rendered) {
          await renderFallbackFrame(time);
        }
      } finally {
        renderInFlightRef.current = false;
        const next = pendingRenderTimeRef.current;
        if (next !== null) {
          pendingRenderTimeRef.current = null;
          doRender(next);
        } else {
          pendingRenderTimeRef.current = null;
        }
      }
    };

    if (playheadChanged || sourceChanged) {
      doRender(playheadPosition);
    } else if (projectChanged) {
      if (modifiedRenderTimerRef.current) {
        clearTimeout(modifiedRenderTimerRef.current);
      }
      modifiedRenderTimerRef.current = setTimeout(() => {
        modifiedRenderTimerRef.current = null;
        doRender(playheadPosition);
      }, 150);
    }

    return () => {
      if (modifiedRenderTimerRef.current) {
        clearTimeout(modifiedRenderTimerRef.current);
        modifiedRenderTimerRef.current = null;
      }
    };
  }, [
    playheadPosition,
    isPlaying,
    isScrubbing,
    renderFrameDirectly,
    renderFallbackFrame,
    releaseScrubVideoElements,
    project,
    proxySourceRevision,
    isDark,
  ]);

  const [previewInvalidateCounter, setPreviewInvalidateCounter] = useState(0);
  useEffect(() => {
    const handler = () => {
      processedAudioBufferCacheRef.current.clear();
      if (audioGraphRef.current) {
        audioGraphRef.current.seekTo(getMasterClock().currentTime);
      }
      setPreviewInvalidateCounter((c) => c + 1);
    };
    window.addEventListener("openreel:preview-invalidate", handler);
    return () => window.removeEventListener("openreel:preview-invalidate", handler);
  }, []);

  useEffect(() => {
    if (isPlaying || previewInvalidateCounter === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderFrameDirectly(playheadPosition);
  }, [previewInvalidateCounter, isPlaying, renderFrameDirectly, playheadPosition]);

  const selectedClipId = useMemo(() => {
    const clipSelection = selectedItems.find((item) => item.type === "clip");
    return clipSelection?.id || null;
  }, [selectedItems]);

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of timelineTracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [selectedClipId, timelineTracks]);

  const clipAtPlayhead = useMemo(() => {
    const videoTracks = timelineTracks.filter((track) => !track.hidden);
    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (!mediaClipHasVisual(clip)) {
          continue;
        }
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        if (playheadPosition >= clipStart && playheadPosition < clipEnd) {
          return clip;
        }
      }
    }
    return null;
  }, [timelineTracks, playheadPosition, mediaClipHasVisual]);

  const selectedTextClipId = useMemo(() => {
    const textClipSelection = selectedItems.find(
      (item) => item.type === "text-clip",
    );
    return textClipSelection?.id || null;
  }, [selectedItems]);

  const selectedTextClip = useMemo<TextClip | null>(() => {
    if (!selectedTextClipId) return null;
    return allTextClips.find((clip) => clip.id === selectedTextClipId) || null;
  }, [selectedTextClipId, allTextClips]);

  const activeTextClip = selectedTextClip;

  const getTransformAtPlayhead = useCallback(
    (clip: PreviewClip): ClipTransform =>
      getAnimatedTransform(
        (clip.transform as ClipTransform) || DEFAULT_TRANSFORM,
        clip.keyframes,
        getClipLocalTime(clip, playheadPosition),
      ),
    [playheadPosition],
  );

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
    getTransformAtPlayhead,
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
  }, [selectedTextClip, settings.width, settings.height, canvasSize, getTitleEngine]);

  const selectedShapeClipId = useMemo(() => {
    const shapeClipSelection = selectedItems.find(
      (item) => item.type === "shape-clip",
    );
    return shapeClipSelection?.id || null;
  }, [selectedItems]);

  const selectedShapeClip = useMemo<
    ShapeClip | SVGClip | StickerClip | null
  >(() => {
    if (!selectedShapeClipId) return null;
    return (
      allShapeClips.find((clip) => clip.id === selectedShapeClipId) || null
    );
  }, [selectedShapeClipId, allShapeClips]);

  const activeShapeClip = selectedShapeClip;

  const handlePreviewKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input, textarea, select, button, [contenteditable='true']",
        )
      ) {
        return;
      }
      const direction =
        event.key === "ArrowLeft"
          ? { x: -1, y: 0 }
          : event.key === "ArrowRight"
            ? { x: 1, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: -1 }
              : event.key === "ArrowDown"
                ? { x: 0, y: 1 }
                : null;
      if (!direction || selectedItems.length === 0) return;

      const amount = event.shiftKey ? 10 : 1;
      const pixelX = direction.x * amount;
      const pixelY = direction.y * amount;
      const normalizedX = pixelX / Math.max(1, settings.width);
      const normalizedY = pixelY / Math.max(1, settings.height);
      const pending: Promise<unknown>[] = [];
      let changed = false;

      beginHistoryGroup("Nudge canvas selection");
      for (const item of selectedItems) {
        if (item.type === "clip") {
          const clip = timelineTracks
            .flatMap((track) => track.clips)
            .find((candidate) => candidate.id === item.id);
          if (!clip) continue;
          changed = true;
          const transform = getTransformAtPlayhead(clip);
          pending.push(
            updateClipTransform(item.id, {
              position: {
                x: transform.position.x + pixelX,
                y: transform.position.y + pixelY,
              },
            }),
          );
          continue;
        }

        if (item.type === "text-clip") {
          const clip = allTextClips.find((candidate) => candidate.id === item.id);
          if (!clip) continue;
          changed = true;
          updateTextTransform(item.id, {
            position: {
              x: clip.transform.position.x + normalizedX,
              y: clip.transform.position.y + normalizedY,
            },
          });
          continue;
        }

        if (item.type === "shape-clip") {
          const clip = allShapeClips.find((candidate) => candidate.id === item.id);
          if (!clip) continue;
          changed = true;
          updateShapeTransform(item.id, {
            position: {
              x: clip.transform.position.x + normalizedX,
              y: clip.transform.position.y + normalizedY,
            },
          });
        }
      }

      if (!changed) {
        endHistoryGroup();
        return;
      }
      event.preventDefault();
      void Promise.all(pending).finally(endHistoryGroup);
    },
    [
      allShapeClips,
      allTextClips,
      beginHistoryGroup,
      endHistoryGroup,
      getTransformAtPlayhead,
      selectedItems,
      settings.height,
      settings.width,
      timelineTracks,
      updateClipTransform,
      updateShapeTransform,
      updateTextTransform,
    ],
  );

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
  }, [selectedShapeClip, settings.width, settings.height]);

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
    [settings.width, settings.height],
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
    [activeGraphicClips, getGraphicClipDisplayBounds],
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
    playheadPosition,
  ]);

  const handleHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandlePosition) => {
      e.stopPropagation();
      e.preventDefault();

      const clip = selectedClip || clipAtPlayhead;
      if (!clip) return;

      const transform = getTransformAtPlayhead(clip);

      isInteractingRef.current = true;
      setInteractionMode("resize");
      setActiveHandle(handle);
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
        },
      };
    },
    [selectedClip, clipAtPlayhead, getTransformAtPlayhead],
  );

  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const clip = selectedClip || clipAtPlayhead;
      if (!clip) return;

      const transform = getTransformAtPlayhead(clip);

      isInteractingRef.current = true;
      setInteractionMode("move");
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
        },
      };
    },
    [selectedClip, clipAtPlayhead, getTransformAtPlayhead],
  );

  const handleTextClipMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!activeTextClip) return;

      const { transform } = activeTextClip;

      isInteractingRef.current = true;
      setInteractionMode("move");
      setInteractionTargetType("text-clip");
      interactionTargetIdRef.current = activeTextClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
        },
      };
    },
    [activeTextClip],
  );

  const handleTextHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandlePosition) => {
      e.stopPropagation();
      e.preventDefault();

      if (!activeTextClip) return;

      const { transform } = activeTextClip;

      isInteractingRef.current = true;
      setInteractionMode("resize");
      setActiveHandle(handle);
      setInteractionTargetType("text-clip");
      interactionTargetIdRef.current = activeTextClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
        },
      };
    },
    [activeTextClip],
  );

  const handleShapeClipMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!activeShapeClip) return;

      const { transform } = activeShapeClip;

      isInteractingRef.current = true;
      setInteractionMode("move");
      setInteractionTargetType("shape-clip");
      interactionTargetIdRef.current = activeShapeClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
        },
      };
    },
    [activeShapeClip],
  );

  const handleShapeHandleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandlePosition) => {
      e.stopPropagation();
      e.preventDefault();

      if (!activeShapeClip) return;

      const { transform } = activeShapeClip;

      isInteractingRef.current = true;
      setInteractionMode("resize");
      setActiveHandle(handle);
      setInteractionTargetType("shape-clip");
      interactionTargetIdRef.current = activeShapeClip.id;
      interactionStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        transform: {
          x: transform.position.x,
          y: transform.position.y,
          scaleX: transform.scale.x,
          scaleY: transform.scale.y,
        },
      };
    },
    [activeShapeClip],
  );

  const handleGraphicsMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (interactionMode !== "none") {
        setHoveredGraphicClipId(null);
        return;
      }

      const clip = findGraphicClipAtPoint(e.clientX, e.clientY);
      setHoveredGraphicClipId(clip ? clip.id : null);
    },
    [interactionMode, findGraphicClipAtPoint],
  );

  const handleGraphicsClick = useCallback(
    (e: React.MouseEvent) => {
      if (interactionMode !== "none") return;

      const clip = findGraphicClipAtPoint(e.clientX, e.clientY);
      if (clip) {
        select({ type: "shape-clip", id: clip.id });
        e.stopPropagation();
      }
    },
    [interactionMode, findGraphicClipAtPoint, select],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (interactionMode === "none" || !interactionStartRef.current) return;

      if (
        interactionTargetType === "text-clip" &&
        textClipBounds &&
        activeTextClip
      ) {
        const deltaX = e.clientX - interactionStartRef.current.x;
        const deltaY = e.clientY - interactionStartRef.current.y;
        const { displayScale } = textClipBounds;

        let newTransform: {
          position?: { x: number; y: number };
          scale?: { x: number; y: number };
        } = {};

        if (interactionMode === "move") {
          const rawX =
            interactionStartRef.current.transform.x +
            deltaX / displayScale / settings.width;
          const rawY =
            interactionStartRef.current.transform.y +
            deltaY / displayScale / settings.height;
          const halfWidth =
            textClipBounds.width / displayScale / settings.width / 2;
          const halfHeight =
            textClipBounds.height / displayScale / settings.height / 2;
          const snapped = snapCanvasPosition({
            x: rawX,
            y: rawY,
            xCandidates: [
              { value: halfWidth, guide: 0 },
              { value: 0.5, guide: 0.5 },
              { value: 1 - halfWidth, guide: 1 },
            ],
            yCandidates: [
              { value: halfHeight, guide: 0 },
              { value: 0.5, guide: 0.5 },
              { value: 1 - halfHeight, guide: 1 },
            ],
            thresholdX: 8 / displayScale / settings.width,
            thresholdY: 8 / displayScale / settings.height,
            enabled: canvasSnappingEnabled && !e.altKey,
          });
          setCanvasSnapGuides({ x: snapped.guideX, y: snapped.guideY });
          newTransform = { position: { x: snapped.x, y: snapped.y } };
        } else if (interactionMode === "resize" && activeHandle) {
          setCanvasSnapGuides({ x: null, y: null });
          const startTransform = interactionStartRef.current.transform;
          let newScaleX = startTransform.scaleX;
          let newScaleY = startTransform.scaleY;

          const scaleDeltaX = deltaX / displayScale / 100;
          const scaleDeltaY = deltaY / displayScale / 100;

          switch (activeHandle) {
            case "e":
            case "se":
            case "ne":
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "w":
            case "sw":
            case "nw":
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "s":
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
            case "n":
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
          }

          newTransform = {
            position: { x: startTransform.x, y: startTransform.y },
            scale: { x: newScaleX, y: newScaleY },
          };
        }

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            const now = performance.now();
            if (
              now - lastStoreUpdateRef.current >= STORE_UPDATE_THROTTLE_MS &&
              interactionTargetIdRef.current
            ) {
              lastStoreUpdateRef.current = now;
              updateTextTransform(interactionTargetIdRef.current, newTransform);
            }
            rafIdRef.current = null;
          });
        }
        return;
      }

      if (
        interactionTargetType === "shape-clip" &&
        shapeClipBounds &&
        activeShapeClip
      ) {
        const deltaX = e.clientX - interactionStartRef.current.x;
        const deltaY = e.clientY - interactionStartRef.current.y;
        const { displayScale } = shapeClipBounds;

        let newTransform: {
          position?: { x: number; y: number };
          scale?: { x: number; y: number };
        } = {};

        if (interactionMode === "move") {
          const rawX =
            interactionStartRef.current.transform.x +
            deltaX / displayScale / settings.width;
          const rawY =
            interactionStartRef.current.transform.y +
            deltaY / displayScale / settings.height;
          const halfWidth =
            shapeClipBounds.width / displayScale / settings.width / 2;
          const halfHeight =
            shapeClipBounds.height / displayScale / settings.height / 2;
          const snapped = snapCanvasPosition({
            x: rawX,
            y: rawY,
            xCandidates: [
              { value: halfWidth, guide: 0 },
              { value: 0.5, guide: 0.5 },
              { value: 1 - halfWidth, guide: 1 },
            ],
            yCandidates: [
              { value: halfHeight, guide: 0 },
              { value: 0.5, guide: 0.5 },
              { value: 1 - halfHeight, guide: 1 },
            ],
            thresholdX: 8 / displayScale / settings.width,
            thresholdY: 8 / displayScale / settings.height,
            enabled: canvasSnappingEnabled && !e.altKey,
          });
          setCanvasSnapGuides({ x: snapped.guideX, y: snapped.guideY });
          newTransform = { position: { x: snapped.x, y: snapped.y } };
        } else if (interactionMode === "resize" && activeHandle) {
          setCanvasSnapGuides({ x: null, y: null });
          const startTransform = interactionStartRef.current.transform;
          let newScaleX = startTransform.scaleX;
          let newScaleY = startTransform.scaleY;

          const scaleDeltaX = deltaX / displayScale / 100;
          const scaleDeltaY = deltaY / displayScale / 100;

          switch (activeHandle) {
            case "e":
            case "se":
            case "ne":
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "w":
            case "sw":
            case "nw":
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "s":
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
            case "n":
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
          }

          newTransform = {
            position: { x: startTransform.x, y: startTransform.y },
            scale: { x: newScaleX, y: newScaleY },
          };
        }

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            const now = performance.now();
            if (
              now - lastStoreUpdateRef.current >= STORE_UPDATE_THROTTLE_MS &&
              interactionTargetIdRef.current
            ) {
              lastStoreUpdateRef.current = now;
              updateShapeTransform(
                interactionTargetIdRef.current,
                newTransform,
              );
            }
            rafIdRef.current = null;
          });
        }
        return;
      }

      if (!clipBounds) return;
      const clip = selectedClip || clipAtPlayhead;
      if (!clip) return;

      const deltaX = e.clientX - interactionStartRef.current.x;
      const deltaY = e.clientY - interactionStartRef.current.y;
      const { displayScale } = clipBounds;

      let newTransform: {
        position?: { x: number; y: number };
        scale?: { x: number; y: number };
      } = {};

      if (interactionMode === "move") {
        const rawX =
          interactionStartRef.current.transform.x + deltaX / displayScale;
        const rawY =
          interactionStartRef.current.transform.y + deltaY / displayScale;
        const halfWidth = clipBounds.width / displayScale / 2;
        const halfHeight = clipBounds.height / displayScale / 2;
        const snapped = snapCanvasPosition({
          x: rawX,
          y: rawY,
          xCandidates: [
            { value: -settings.width / 2 + halfWidth, guide: 0 },
            { value: 0, guide: 0.5 },
            { value: settings.width / 2 - halfWidth, guide: 1 },
          ],
          yCandidates: [
            { value: -settings.height / 2 + halfHeight, guide: 0 },
            { value: 0, guide: 0.5 },
            { value: settings.height / 2 - halfHeight, guide: 1 },
          ],
          thresholdX: 8 / displayScale,
          thresholdY: 8 / displayScale,
          enabled: canvasSnappingEnabled && !e.altKey,
        });
        setCanvasSnapGuides({ x: snapped.guideX, y: snapped.guideY });
        newTransform = { position: { x: snapped.x, y: snapped.y } };
      } else if (interactionMode === "resize" && activeHandle) {
        setCanvasSnapGuides({ x: null, y: null });
        const startTransform = interactionStartRef.current.transform;
        let newScaleX = startTransform.scaleX;
        let newScaleY = startTransform.scaleY;
        let newX = startTransform.x;
        let newY = startTransform.y;

        // Base dimensions match how the clip is actually rendered so resize
        // handles track the cursor regardless of fit mode.
        const baseScaleW =
          (clipBounds.width / displayScale) /
          Math.max(0.001, startTransform.scaleX);
        const baseScaleH =
          (clipBounds.height / displayScale) /
          Math.max(0.001, startTransform.scaleY);

        const scaleDeltaX = deltaX / displayScale / (baseScaleW / 2);
        const scaleDeltaY = deltaY / displayScale / (baseScaleH / 2);

        switch (activeHandle) {
          case "e":
            newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
            if (lockAspectRatio) newScaleY = newScaleX;
            break;
          case "w":
            newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
            if (lockAspectRatio) newScaleY = newScaleX;
            newX = startTransform.x + deltaX / displayScale / 2;
            break;
          case "s":
            newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            if (lockAspectRatio) newScaleX = newScaleY;
            break;
          case "n":
            newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            if (lockAspectRatio) newScaleX = newScaleY;
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
          case "se":
            if (lockAspectRatio) {
              const avgDelta = (scaleDeltaX + scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            }
            break;
          case "sw":
            if (lockAspectRatio) {
              const avgDelta = (-scaleDeltaX + scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            }
            newX = startTransform.x + deltaX / displayScale / 2;
            break;
          case "ne":
            if (lockAspectRatio) {
              const avgDelta = (scaleDeltaX - scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            }
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
          case "nw":
            if (lockAspectRatio) {
              const avgDelta = (-scaleDeltaX - scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            }
            newX = startTransform.x + deltaX / displayScale / 2;
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
        }

        newTransform = {
          position: { x: newX, y: newY },
          scale: { x: newScaleX, y: newScaleY },
        };
      }

      pendingTransformRef.current = {
        clipId: clip.id,
        transform: newTransform,
      };

      const currentTransform = clip.transform || {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
      };
      setLiveTransform({
        position: newTransform.position || currentTransform.position,
        scale: newTransform.scale || currentTransform.scale,
      });

      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          const now = performance.now();
          if (
            pendingTransformRef.current &&
            now - lastStoreUpdateRef.current >= STORE_UPDATE_THROTTLE_MS
          ) {
            lastStoreUpdateRef.current = now;
            updateClipTransform(
              pendingTransformRef.current.clipId,
              pendingTransformRef.current.transform,
            );
          }
          rafIdRef.current = null;
        });
      }
    },
    [
      interactionMode,
      activeHandle,
      clipBounds,
      selectedClip,
      clipAtPlayhead,
      updateClipTransform,
      settings.width,
      settings.height,
      canvasSnappingEnabled,
      lockAspectRatio,
      interactionTargetType,
      textClipBounds,
      activeTextClip,
      updateTextTransform,
      activeShapeClip,
      shapeClipBounds,
      updateShapeTransform,
    ],
  );

  const handleMouseUp = useCallback(() => {
    let transformCommit: ReturnType<typeof updateClipTransform> | null = null;
    if (pendingTransformRef.current) {
      transformCommit = updateClipTransform(
        pendingTransformRef.current.clipId,
        pendingTransformRef.current.transform,
      );
      pendingTransformRef.current = null;
    }
    setInteractionTargetType(null);
    interactionTargetIdRef.current = null;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const wasInteracting = isInteractingRef.current;
    isInteractingRef.current = false;
    setInteractionMode("none");
    setActiveHandle(null);
    interactionStartRef.current = null;
    setLiveTransform(null);
    setCanvasSnapGuides({ x: null, y: null });

    if (wasInteracting) {
      if (transformCommit) {
        void transformCommit.then(() => renderFrameDirectly(playheadPosition));
      } else {
        void renderFrameDirectly(playheadPosition);
      }
    }
  }, [updateClipTransform, renderFrameDirectly, playheadPosition]);

  const handleCropChange = useCallback(
    (crop: { x: number; y: number; width: number; height: number }) => {
      if (cropClipId) {
        updateClipTransform(cropClipId, { crop });
      }
    },
    [cropClipId, updateClipTransform],
  );

  const handleCropComplete = useCallback(() => {
    setCropMode(false);
  }, [setCropMode]);

  const handleCropCancel = useCallback(() => {
    setCropMode(false);
  }, [setCropMode]);

  useEffect(() => {
    if (interactionMode !== "none") {
      const handleGlobalMouseUp = () => {
        let transformCommit: ReturnType<
          typeof updateClipTransform
        > | null = null;
        if (pendingTransformRef.current) {
          transformCommit = updateClipTransform(
            pendingTransformRef.current.clipId,
            pendingTransformRef.current.transform,
          );
          pendingTransformRef.current = null;
        }
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        const wasInteracting = isInteractingRef.current;
        isInteractingRef.current = false;
        setInteractionMode("none");
        setActiveHandle(null);
        interactionStartRef.current = null;
        setLiveTransform(null);

        if (wasInteracting) {
          if (transformCommit) {
            void transformCommit.then(() =>
              renderFrameDirectly(playheadPosition),
            );
          } else {
            void renderFrameDirectly(playheadPosition);
          }
        }
      };

      window.addEventListener("pointerup", handleGlobalMouseUp);
      window.addEventListener("pointercancel", handleGlobalMouseUp);
      return () => {
        window.removeEventListener("pointerup", handleGlobalMouseUp);
        window.removeEventListener("pointercancel", handleGlobalMouseUp);
      };
    }
  }, [
    interactionMode,
    renderFrameDirectly,
    playheadPosition,
    updateClipTransform,
  ]);

  const handleSkipBack = useCallback(() => {
    seekRelative(-5);
  }, [seekRelative]);

  const handleSkipForward = useCallback(() => {
    const current = useTimelineStore.getState().playheadPosition;
    const end = actualEndTime > 0 ? actualEndTime : project.timeline.duration || 0;
    seekTo(end > 0 ? Math.min(current + 5, end) : current + 5);
  }, [seekTo, actualEndTime, project.timeline.duration]);

  const handleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      setZoomLevel(1);
      container
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
        })
        .catch((err) => {
          console.error("Error entering fullscreen:", err);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => {
          setIsFullscreen(false);
        })
        .catch((err) => {
          console.error("Error exiting fullscreen:", err);
        });
    }
  }, []);

  const handleMaximize = useCallback(() => {
    setZoomLevel(1);
    setIsMaximized((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const previewLoopRange = resolvePlaybackLoop(
    { loopEnabled: true, loopStart, loopEnd },
    actualEndTime,
  );
  const handleToggleLoop = () => {
    const state = useTimelineStore.getState();
    if (!state.loopEnabled && previewLoopRange) {
      state.setLoopRange(previewLoopRange.start, previewLoopRange.end);
    }
    state.setLoopEnabled(!state.loopEnabled);
  };

  const showResizeHandles = !isPlaying && selectedClip && clipBounds;

  const showTextClipHandles = !isPlaying && selectedTextClip && textClipBounds;


  const showShapeClipHandles =
    !isPlaying &&
    selectedShapeClip &&
    shapeClipBounds;

  const showSubtitleOverlay =
    !isPlaying && selectedSubtitleObj && subtitleBounds;

  const cropClip = useMemo(() => {
    if (!cropMode || !cropClipId) return null;

    for (const track of timelineTracks) {
      const clip = track.clips.find((c) => c.id === cropClipId);
      if (clip) return clip;
    }
    return null;
  }, [cropMode, cropClipId, timelineTracks]);

  const cropMediaData = useMemo(() => {
    if (!cropMode || !cropClipId || !cropClip) return null;

    const mediaItem = getMediaItem(cropClip.mediaId);
    if (!mediaItem) return null;

    let src: string | null = null;
    if (mediaItem.blob) {
      src = URL.createObjectURL(mediaItem.blob);
    } else if (mediaItem.originalUrl) {
      src = mediaItem.originalUrl;
    }

    if (!src) return null;

    return {
      src,
      type: mediaItem.type as "video" | "image",
    };
  }, [cropMode, cropClipId, cropClip, getMediaItem]);

  const cropVideoSrc = cropMediaData?.src ?? null;
  const cropMediaType = cropMediaData?.type ?? "video";

  const shouldShowCropMode = cropMode && cropClipId && cropClip && cropVideoSrc;

  return (
    <div
      ref={containerRef}
      data-tour="preview"
      data-player-expanded={compactExpanded ? "true" : undefined}
      tabIndex={0}
      aria-label="Preview canvas"
      onKeyDown={handlePreviewKeyDown}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest("input, textarea, select, button")) {
          containerRef.current?.focus({ preventScroll: true });
        }
      }}
      className={`${compactExpanded ? "fixed inset-0 z-[60]" : "relative"} w-full h-full min-h-0 min-w-0 bg-stage-bg flex flex-col group overflow-hidden outline-none`}
    >
      {/* ── Panel bar header (mockup: 'Player') ───────────────── */}
      {!compact && !isMaximized && !isFullscreen && (
        <div className="flex items-center px-3.5 py-2 border-b border-border bg-bg-1 gap-2.5 min-h-[38px] shrink-0">
          <Text type="label" color="primary" weight="semibold" className="text-[13px] tracking-tight text-fg m-0">Player</Text>
          <div className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Live preview" />
          </div>
        </div>
      )}

      {/* Crop Mode View - Full Screen Overlay */}
      {shouldShowCropMode && (
        <CropModeView
          clip={cropClip!}
          videoSrc={cropVideoSrc}
          mediaType={cropMediaType}
          currentTime={playheadPosition}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          onCropChange={handleCropChange}
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      {/* Video Area */}
      <div
        ref={videoAreaRef}
        className={`flex-1 min-h-0 min-w-0 relative flex items-center justify-center bg-bg-1 transition-all duration-300 ${
          isMaximized || isFullscreen ? "p-0" : "p-[18px]"
        } ${zoomLevel > 1 ? "overflow-auto" : ""}`}
        onPointerMove={interactionMode !== "none" ? handleMouseMove : undefined}
        onPointerUp={handleMouseUp}
      >
        <div
          ref={overlayRef}
          className={`relative isolate bg-[var(--screen-bg)] overflow-visible transition-all duration-300 ${
            isMaximized || isFullscreen
              ? "rounded-none ring-0 shadow-none"
              : isDark
                ? "shadow-2xl rounded-[10px] ring-1 ring-border shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                : "rounded-[10px] ring-1 ring-border shadow-sm"
          }`}
          style={{
            width: `${previewFrameSize.width}px`,
            height: `${previewFrameSize.height}px`,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
          onMouseMove={!isPlaying ? handleGraphicsMouseMove : undefined}
          onClick={!isPlaying ? handleGraphicsClick : undefined}
          onMouseLeave={() => setHoveredGraphicClipId(null)}
        >
          <canvas
            ref={canvasRef}
            width={previewRes.width}
            height={previewRes.height}
            className="w-full h-full object-contain bg-[var(--screen-bg)] rounded-[10px]"
            style={{
              cursor: hoveredGraphicClipId && !isPlaying ? "pointer" : "default",
            }}
          />

          {showCompositionGrid && !cropMode ? (
            <div
              aria-label="Composition grid"
              className="pointer-events-none absolute inset-0 z-20"
            >
              {[1, 2].map((line) => (
                <React.Fragment key={line}>
                  <span
                    className="absolute inset-y-0 w-px bg-white/45 shadow-[0_0_1px_rgba(0,0,0,0.9)]"
                    style={{ left: `${(line / 3) * 100}%` }}
                  />
                  <span
                    className="absolute inset-x-0 h-px bg-white/45 shadow-[0_0_1px_rgba(0,0,0,0.9)]"
                    style={{ top: `${(line / 3) * 100}%` }}
                  />
                </React.Fragment>
              ))}
            </div>
          ) : null}

          {showSafeMargins && !cropMode ? (
            <div
              aria-label="Title and action safe margins"
              className="pointer-events-none absolute inset-0 z-20"
            >
              <span className="absolute inset-[5%] border border-dashed border-white/60 shadow-[0_0_1px_rgba(0,0,0,0.9)]" />
              <span className="absolute inset-[10%] border border-white/75 shadow-[0_0_1px_rgba(0,0,0,0.9)]" />
              <span className="absolute left-[10%] top-[10%] rounded-br bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/80">
                Title safe
              </span>
            </div>
          ) : null}

          {canvasSnapGuides.x !== null && !cropMode ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-30 w-px bg-accent shadow-[0_0_3px_var(--accent)]"
              style={{ left: `${canvasSnapGuides.x * 100}%` }}
            />
          ) : null}
          {canvasSnapGuides.y !== null && !cropMode ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 z-30 h-px bg-accent shadow-[0_0_3px_var(--accent)]"
              style={{ top: `${canvasSnapGuides.y * 100}%` }}
            />
          ) : null}

          {/* Processing Overlay */}
          <ProcessingOverlay />

          {/* Motion Path Overlay */}
          {motionPathMode && motionPathConfig && motionPathClip && (
            <div className="absolute inset-0 pointer-events-auto z-30">
              <MotionPathOverlay
                config={motionPathConfig}
                canvasWidth={settings.width}
                canvasHeight={settings.height}
                currentTime={playheadPosition - motionPathClip.startTime}
                clipDuration={motionPathClip.duration}
                onPointMove={handleMotionPathPointMove}
                onPointAdd={handleMotionPathPointAdd}
                onPointRemove={handleMotionPathPointRemove}
                onControlPointMove={handleMotionPathControlPointMove}
                disabled={isPlaying}
              />
            </div>
          )}

          {/* Particle Effects Renderer */}
          {particleEffects.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <ParticleRenderer
                effects={particleEffects}
                width={settings.width}
                height={settings.height}
                currentTime={playheadPosition}
                isPlaying={isPlaying}
              />
            </div>
          )}

          {/* Resize/Transform Overlay */}
          {!cropMode && showResizeHandles && clipBounds && (
            <div
              className="absolute pointer-events-none touch-none"
              style={{
                left: clipBounds.x,
                top: clipBounds.y,
                width: clipBounds.width,
                height: clipBounds.height,
              }}
            >
              {/* Selection border */}
              <div className="absolute inset-0 border-2 border-primary pointer-events-none" />

              {/* Move handle (center) */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-primary/80 rounded-full flex items-center justify-center cursor-move pointer-events-auto hover:bg-primary transition-colors"
                onPointerDown={handleClipMouseDown}
                title="Drag to move"
              >
                <Move size={14} className="text-white" />
              </div>

              {/* Aspect ratio lock toggle */}
              <Button
                label={lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                variant="ghost"
                className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded pointer-events-auto transition-colors ${
                  lockAspectRatio
                    ? "bg-primary text-white"
                    : "bg-background-tertiary text-text-secondary border border-border hover:bg-background-elevated"
                }`}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
              >
                {lockAspectRatio ? "🔒 Locked" : "🔓 Free"}
              </Button>

              {/* Corner resize handles */}
              <div
                className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-nw-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "nw")}
              />
              <div
                className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-ne-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "ne")}
              />
              <div
                className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-sw-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "sw")}
              />
              <div
                className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-se-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "se")}
              />

              {/* Edge resize handles */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-2 w-6 h-4 bg-white border-2 border-primary rounded-sm cursor-n-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "n")}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-4 bg-white border-2 border-primary rounded-sm cursor-s-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "s")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-6 bg-white border-2 border-primary rounded-sm cursor-w-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "w")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-6 bg-white border-2 border-primary rounded-sm cursor-e-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "e")}
              />
            </div>
          )}

          {/* Text Clip Resize/Transform Overlay */}
          {showTextClipHandles && textClipBounds && (
            <div
              className="absolute pointer-events-none touch-none"
              style={{
                left: textClipBounds.x,
                top: textClipBounds.y,
                width: textClipBounds.width,
                height: textClipBounds.height,
              }}
            >
              {/* Selection border - cyan for text clips */}
              <div className="absolute inset-0 border-2 border-cyan-500 pointer-events-none" />

              {/* Move handle (center) */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-cyan-500/80 rounded-full flex items-center justify-center cursor-move pointer-events-auto hover:bg-cyan-500 transition-colors"
                onPointerDown={handleTextClipMouseDown}
                title="Drag to move text"
              >
                <Move size={14} className="text-white" />
              </div>

              {/* Aspect ratio lock toggle */}
              <Button
                label={lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                variant="ghost"
                className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded pointer-events-auto transition-colors ${
                  lockAspectRatio
                    ? "bg-cyan-500 text-white"
                    : "bg-background-tertiary text-text-secondary border border-border hover:bg-background-elevated"
                }`}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
              >
                {lockAspectRatio ? "🔒 Locked" : "🔓 Free"}
              </Button>

              {/* Corner resize handles */}
              <div
                className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-nw-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "nw")}
              />
              <div
                className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-ne-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "ne")}
              />
              <div
                className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-sw-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "sw")}
              />
              <div
                className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-se-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "se")}
              />

              {/* Edge resize handles */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-2 w-6 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-n-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "n")}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-s-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "s")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-6 bg-white border-2 border-cyan-500 rounded-sm cursor-w-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "w")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-6 bg-white border-2 border-cyan-500 rounded-sm cursor-e-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "e")}
              />
            </div>
          )}

          {/* Shape Clip Resize/Transform Overlay */}
          {showShapeClipHandles && shapeClipBounds && (
            <div
              className="absolute pointer-events-none touch-none"
              style={{
                left: shapeClipBounds.x,
                top: shapeClipBounds.y,
                width: shapeClipBounds.width,
                height: shapeClipBounds.height,
              }}
            >
              {selectedShapeClip.type !== "svg" && (
                <div className="absolute inset-0 border-2 border-green-500 pointer-events-none" />
              )}

              {/* Move handle (center) */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-green-500/80 rounded-full flex items-center justify-center cursor-move pointer-events-auto hover:bg-green-500 transition-colors"
                onPointerDown={handleShapeClipMouseDown}
                title="Drag to move shape"
              >
                <Move size={14} className="text-white" />
              </div>

              {/* Aspect ratio lock toggle */}
              <Button
                label={lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                variant="ghost"
                className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded pointer-events-auto transition-colors ${
                  lockAspectRatio
                    ? "bg-green-500 text-white"
                    : "bg-background-tertiary text-text-secondary border border-border hover:bg-background-elevated"
                }`}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
              >
                {lockAspectRatio ? "🔒 Locked" : "🔓 Free"}
              </Button>

              {/* Corner resize handles */}
              <div
                className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-nw-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "nw")}
              />
              <div
                className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-ne-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "ne")}
              />
              <div
                className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-sw-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "sw")}
              />
              <div
                className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-se-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "se")}
              />

              {/* Edge resize handles */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-2 w-6 h-4 bg-white border-2 border-green-500 rounded-sm cursor-n-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "n")}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-4 bg-white border-2 border-green-500 rounded-sm cursor-s-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "s")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-6 bg-white border-2 border-green-500 rounded-sm cursor-w-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "w")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-6 bg-white border-2 border-green-500 rounded-sm cursor-e-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "e")}
              />
            </div>
          )}

          {/* Subtitle Selection Overlay */}
          {showSubtitleOverlay && subtitleBounds && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: subtitleBounds.x,
                top: subtitleBounds.y,
                width: subtitleBounds.width,
                height: subtitleBounds.height,
              }}
            >
              {/* Selection border - yellow/orange for subtitles */}
              <div className="absolute inset-0 border-2 border-yellow-500 rounded-lg pointer-events-none animate-pulse" />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-yellow-500 rounded text-[10px] font-medium text-black whitespace-nowrap">
                Subtitle Selected - Edit in Inspector
              </div>
            </div>
          )}

          {/* Graphic Clip Hover Indicators */}
          {!cropMode && !isPlaying &&
            activeGraphicClips.map((clip) => {
              if (clip.type === "svg") return null;
              if (clip.id === selectedShapeClipId) return null;
              if (clip.id !== hoveredGraphicClipId) return null;
              const bounds = getGraphicClipDisplayBounds(clip);
              if (!bounds) return null;
              return (
                <div
                  key={clip.id}
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: bounds.x,
                    top: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                  }}
                >
                  <div className="absolute inset-0 border-2 border-dashed border-white/80 rounded-sm" />
                  <div
                    aria-hidden="true"
                    className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/70 rounded text-[10px] text-white whitespace-nowrap"
                  >
                    Click to select
                  </div>
                </div>
              );
            })}
          </div>
        {exportState.isExporting && <ExportProgressOverlay progress={exportState.progress} phase={exportState.phase} width={videoAreaSize.width} height={videoAreaSize.height} />}
      </div>

      {/* Player Controls with integrated Scrub Bar */}
      <div
        className={`shrink-0 border-t border-border transition-all duration-300 ${
          isMaximized || isFullscreen
            ? "z-50 bg-bg-1 backdrop-blur-sm"
            : "z-20 bg-bg-1"
        }`}
      >
        {/* Scrub Bar - integrated at top of controls */}
        <PreviewScrubBar
          position={playheadPosition}
          duration={actualEndTime}
          onScrubStart={() => getPlaybackBridge().startScrubbing()}
          onScrub={(time) => getPlaybackBridge().scrubTo(time)}
          onScrubEnd={() => getPlaybackBridge().endScrubbing()}
        />

        {/* Controls row */}
        <div data-preview-transport className="min-h-12 px-3 py-1 flex flex-wrap items-center gap-2">
        {!compact && (
          <>
            <div data-preview-timecode className="flex items-center gap-2">
              <PreviewTimecode position={playheadPosition} duration={actualEndTime} frameRate={settings.frameRate}
                disabled={Boolean(playbackLockedReason) || exportState.isExporting} />
            </div>

            <PreviewPlaybackButtons
              isPlaying={isPlaying}
              playbackLockedReason={playbackLockedReason}
              onSkipBack={handleSkipBack}
              onTogglePlayback={togglePlayback}
              onSkipForward={handleSkipForward}
            />
          </>
        )}

        <div data-preview-tools className="flex gap-1.5 items-center">
          {compact && (
            <>
              <PreviewPlaybackButtons
                isPlaying={isPlaying}
                playbackLockedReason={playbackLockedReason}
                onSkipBack={handleSkipBack}
                onTogglePlayback={togglePlayback}
                onSkipForward={handleSkipForward}
              />
              <div data-preview-timecode className="flex items-center gap-2">
                <PreviewTimecode position={playheadPosition} duration={actualEndTime} frameRate={settings.frameRate}
                  disabled={Boolean(playbackLockedReason) || exportState.isExporting} />
              </div>
            </>
          )}
          <IconButton
            label={loopEnabled ? "Disable preview loop" : "Enable preview loop"}
            title={`Loop ${formatFrameTimecode(previewLoopRange?.start ?? 0, settings.frameRate)} to ${formatFrameTimecode(previewLoopRange?.end ?? 0, settings.frameRate)} • I: mark start • O: mark end • Shift+L: toggle`}
            icon={<Repeat size={16} />}
            aria-pressed={loopEnabled}
            variant="ghost"
            size="sm"
            onClick={handleToggleLoop}
            isDisabled={actualEndTime <= 0 || exportState.isExporting}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${loopEnabled ? "bg-accent/15 text-accent" : "bg-bg-2 text-fg-2 hover:bg-bg-3 hover:text-fg"}`}
          />
          <IconButton
            label={isMuted ? "Unmute" : "Mute"}
            icon={isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            variant="ghost"
            size="sm"
            onClick={() => setIsMuted(!isMuted)}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              isMuted
                ? "bg-bg-2 text-status-error"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />

          {/* Aspect ratio (project canvas size) */}
          <div className="relative">
            <Button
              label="Aspect ratio"
              variant="ghost"
              onClick={() => setShowAspectMenu(!showAspectMenu)}
              className="flex items-center gap-1.5 rounded-[7px] bg-bg-2 px-[11px] py-[7px] text-[12px] font-medium text-fg-2 hover:bg-bg-3 hover:text-fg transition-colors"
            >
              <div className="flex items-center gap-1">
                <Proportions size={12} />
                <span>{aspectLabelFor(settings.width, settings.height)}</span>
              </div>
            </Button>
            {showAspectMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowAspectMenu(false)}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-elev border border-border rounded-md shadow-md py-1 z-50 min-w-[120px]">
                  {ASPECT_PRESETS.map((opt) => {
                    const isActive =
                      settings.width === opt.width &&
                      settings.height === opt.height;
                    return (
                      <Button
                        key={opt.label}
                        label={`${opt.label} ${opt.width} by ${opt.height}`}
                        variant="ghost"
                        onClick={() => {
                          void updateSettings({
                            width: opt.width,
                            height: opt.height,
                          });
                          setShowAspectMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-[11px] font-mono text-left hover:bg-hover transition-colors flex items-center justify-between gap-3 ${
                          isActive ? "text-accent" : "text-fg-2"
                        }`}
                        >
                        <span>{opt.label}</span>
                        <span className="text-fg-3 text-[10px]">
                          {opt.width}×{opt.height}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Playback Quality (render resolution) */}
          <div className="relative">
            <Button
              label="Playback quality"
              variant="ghost"
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className="rounded-[7px] bg-bg-2 px-[11px] py-[7px] text-[12px] font-medium text-fg-2 hover:bg-bg-3 hover:text-fg transition-colors"
            >
              {PREVIEW_QUALITY_OPTIONS.find((o) => o.value === playbackQuality)
                ?.label ?? "Auto"}
            </Button>
            {showQualityMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowQualityMenu(false)}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-elev border border-border rounded-md shadow-md py-1 z-50 min-w-[80px]">
                  {PREVIEW_QUALITY_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      label={opt.label}
                      variant="ghost"
                      onClick={() => {
                        setPlaybackQuality(opt.value);
                        setShowQualityMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-[11px] font-mono text-left hover:bg-hover transition-colors ${
                        playbackQuality === opt.value
                          ? "text-accent"
                          : "text-fg-2"
                      }`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Zoom Control */}
          <div className="relative">
            <Button
              label="Preview Zoom"
              variant="ghost"
              onClick={() => setShowZoomMenu(!showZoomMenu)}
              className="flex items-center gap-1.5 rounded-[7px] bg-bg-2 px-[11px] py-[7px] text-[12px] font-medium text-fg-2 hover:bg-bg-3 hover:text-fg transition-colors"
            >
              <div className="flex items-center gap-1">
                <ZoomIn size={12} />
                <span>{Math.round(zoomLevel * 100)}%</span>
              </div>
            </Button>
            {showZoomMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowZoomMenu(false)}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-elev border border-border rounded-md shadow-md py-1 z-50 min-w-[80px]">
                  {ZOOM_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      label={opt.label}
                      variant="ghost"
                      onClick={() => {
                        setZoomLevel(opt.value);
                        setShowZoomMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-[11px] font-mono text-left hover:bg-hover transition-colors ${
                        zoomLevel === opt.value
                          ? "text-accent"
                          : "text-fg-2"
                      }`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>

          <IconButton
            label="Canvas snapping"
            icon={<Magnet size={16} />}
            variant="ghost"
            size="sm"
            aria-pressed={canvasSnappingEnabled}
            onClick={() => {
              setCanvasSnappingEnabled((enabled) => !enabled);
              setCanvasSnapGuides({ x: null, y: null });
            }}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              canvasSnappingEnabled
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />
          <IconButton
            label="Composition grid"
            icon={<LayoutGrid size={16} />}
            variant="ghost"
            size="sm"
            aria-pressed={showCompositionGrid}
            onClick={() => setShowCompositionGrid((visible) => !visible)}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              showCompositionGrid
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />
          <IconButton
            label="Title and action safe margins"
            icon={<Proportions size={16} />}
            variant="ghost"
            size="sm"
            aria-pressed={showSafeMargins}
            onClick={() => setShowSafeMargins((visible) => !visible)}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              showSafeMargins
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />

          <IconButton
            label={isFullscreen ? "Exit Full Screen" : "Full Screen"}
            icon={<Monitor size={16} />}
            variant="ghost"
            size="sm"
            onClick={handleFullscreen}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              isFullscreen
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />
          <IconButton
            label={isMaximized ? "Restore Size" : "Maximize Preview"}
            icon={isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            variant="ghost"
            size="sm"
            onClick={handleMaximize}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              isMaximized
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />
        </div>
        </div>
      </div>
    </div>
  );
};

export default Preview;
