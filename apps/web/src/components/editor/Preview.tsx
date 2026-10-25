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
import { PreviewHeader } from "./preview/PreviewHeader";
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
  getMasterClock,
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
  CropModeView,
  MotionPathOverlay,
  ParticleRenderer,
  computePreviewResolution,
  PREVIEW_MAX_DIMENSION,
  previewQualityScale,
  PREVIEW_QUALITY_OPTIONS,
} from "./preview/index";
import type { PreviewClip } from "./preview/preview-runtime-types";
import {
  applyPreviewAdjustmentLayers,
  clipCssFilterOnly,
} from "./preview/preview-adjustment-layers";
import {
  ASPECT_PRESETS,
  aspectLabelFor,
} from "./preview/preview-aspect";
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
import { usePreviewPlayback } from "./preview/usePreviewPlayback";
import { usePreviewModifiedRender } from "./preview/usePreviewModifiedRender";
import { usePreviewSelection } from "./preview/usePreviewSelection";
import { usePreviewKeyboardNudge } from "./preview/usePreviewKeyboardNudge";
import { usePreviewCropControls, usePreviewCropData, usePreviewSkipControls, usePreviewWindowMode } from "./preview/usePreviewWindowMode";
import { usePreviewClipBounds, usePreviewGraphicBounds } from "./preview/usePreviewBounds";
import { usePreviewPointer, usePreviewPointerEnd, usePreviewPointerRelease, usePreviewPointerStart } from "./preview/usePreviewPointer";
import { usePreviewPointerMove } from "./preview/usePreviewPointerMove";
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

  usePreviewPlayback({
    refs,
    project,
    previewRes,
    actualEndTime,
    editingFrameDuration,
    isMuted,
    isPlaying,
    setPlayheadPosition,
    pause,
    getMediaItem,
    getOriginalMediaItem,
    failProxyPlayback,
    proxySourceRevision,
    canUseNativeVideoPlayback,
    startNativeVideoPlayback,
    cleanupPlaybackResources,
    cleanupAudioResources,
    setupAudioFromAudioTrack,
    preDecodeAllAudioBuffers,
    getAudioClipsForScheduler,
    hasActiveMotionInstances,
    renderMotionInstancesForTrack,
    mediaClipHasAudio,
    mediaClipHasVisual,
    clipMasksById,
    drawClipFrame,
    fillPreviewBackground,
  });

  usePreviewModifiedRender({
    refs,
    playheadPosition,
    isPlaying,
    isScrubbing,
    renderFrameDirectly,
    renderFallbackFrame,
    releaseScrubVideoElements,
    project,
    proxySourceRevision,
    isDark,
  });

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

  const {
    selectedClipId,
    selectedClip,
    clipAtPlayhead,
    selectedTextClipId,
    selectedTextClip,
    selectedShapeClipId,
    selectedShapeClip,
  } = usePreviewSelection({
    selectedItems,
    timelineTracks,
    allTextClips,
    allShapeClips,
    playheadPosition,
    mediaClipHasVisual,
  });

  const activeTextClip = selectedTextClip;
  const activeShapeClip = selectedShapeClip;

  const getTransformAtPlayhead = useCallback(
    (clip: PreviewClip): ClipTransform =>
      getAnimatedTransform(
        (clip.transform as ClipTransform) || DEFAULT_TRANSFORM,
        clip.keyframes,
        getClipLocalTime(clip, playheadPosition),
      ),
    [playheadPosition],
  );

  const { clipBounds, textClipBounds } = usePreviewClipBounds({
    refs, selectedClip, clipAtPlayhead, canvasSize, getTransformAtPlayhead, liveTransform,
    settings, getMediaItem, selectedTextClip, getTitleEngine,
  });

  const handlePreviewKeyDown = usePreviewKeyboardNudge({
    allShapeClips,
    allTextClips,
    beginHistoryGroup,
    endHistoryGroup,
    getTransformAtPlayhead,
    selectedItems,
    canvasHeight: settings.height,
    canvasWidth: settings.width,
    timelineTracks,
    updateClipTransform,
    updateShapeTransform,
    updateTextTransform,
  });

  const { hoveredGraphicClipId, setHoveredGraphicClipId, activeGraphicClips, shapeClipBounds,
    getGraphicClipDisplayBounds, findGraphicClipAtPoint, selectedSubtitleId, selectedSubtitleObj, subtitleBounds
  } = usePreviewGraphicBounds({
    refs, settings, allShapeClips, playheadPosition, selectedItems, allSubtitles, selectedShapeClip,
  });

  const {
    handleHandleMouseDown,
    handleClipMouseDown,
    handleTextClipMouseDown,
    handleTextHandleMouseDown,
    handleShapeClipMouseDown,
    handleShapeHandleMouseDown,
  } = usePreviewPointerStart({
    refs,
    selectedClip,
    clipAtPlayhead,
    activeTextClip,
    activeShapeClip,
    getTransformAtPlayhead,
    setInteractionMode,
    setActiveHandle,
    setInteractionTargetType,
  });
  const { handleGraphicsMouseMove, handleGraphicsClick } = usePreviewPointer({
    interactionMode,
    findGraphicClipAtPoint,
    setHoveredGraphicClipId,
    select,
  });

  const handleMouseMove = usePreviewPointerMove({
    refs,
    interactionMode,
    activeHandle,
    interactionTargetType,
    selectedClip,
    clipAtPlayhead,
    activeTextClip,
    activeShapeClip,
    clipBounds,
    textClipBounds,
    shapeClipBounds,
    settings,
    canvasSnappingEnabled,
    lockAspectRatio,
    setInteractionMode,
    setActiveHandle,
    setInteractionTargetType,
    setLiveTransform,
    setCanvasSnapGuides,
    updateClipTransform,
    updateTextTransform,
    updateShapeTransform,
    snapCanvasPosition,
    STORE_UPDATE_THROTTLE_MS,
  });
  const handleMouseUp = usePreviewPointerEnd({ refs, setInteractionTargetType, setInteractionMode, setActiveHandle, setLiveTransform, setCanvasSnapGuides, updateClipTransform, renderFrameDirectly, playheadPosition });

  const { handleCropChange, handleCropComplete, handleCropCancel } = usePreviewCropControls(cropClipId, updateClipTransform, setCropMode);

  usePreviewPointerRelease({ refs, interactionMode, setInteractionMode, setActiveHandle, setLiveTransform, renderFrameDirectly, playheadPosition, updateClipTransform });

  const { handleSkipBack, handleSkipForward } = usePreviewSkipControls(seekRelative, seekTo, actualEndTime, project.timeline.duration || 0);
  const { handleFullscreen, handleMaximize } = usePreviewWindowMode({
    refs,
    setZoomLevel,
    setIsFullscreen,
    setIsMaximized,
  });

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

  const { cropClip, cropMediaData, cropVideoSrc, cropMediaType } = usePreviewCropData(cropMode, cropClipId, timelineTracks, getMediaItem);
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
      <PreviewHeader compact={compact} isMaximized={isMaximized} isFullscreen={isFullscreen} />

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
