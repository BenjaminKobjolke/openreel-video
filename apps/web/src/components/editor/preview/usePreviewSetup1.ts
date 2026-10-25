import { useEffect, useState, useMemo } from "react";
import { useCompactEditor } from "../../../hooks/useCompactEditor";
import { useProjectFonts } from "../../../hooks/useProjectFonts";
import { useProjectStore } from "../../../stores/project-store";
import { usePreviewProxyStore } from "../../../stores/preview-proxy-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { useUIStore } from "../../../stores/ui-store";
import { useThemeStore } from "../../../stores/theme-store";
import { useEngineStore } from "../../../stores/engine-store";
import { type HandlePosition, type InteractionMode, computePreviewResolution, PREVIEW_MAX_DIMENSION, previewQualityScale } from "./index";
import { editingFrameDurationMs } from ".././editing-frame-rate";
import { usePreviewRefs } from "./usePreviewRefs";
import { usePreviewBackgroundMirror, usePreviewRefMirror } from "./usePreviewRefMirrors";
import { usePreviewVideoCache } from "./usePreviewVideoCache";
import { usePreviewMedia } from "./usePreviewMedia";

export function usePreviewSetup1() {
    const compact = useCompactEditor();
  
    useEffect(() => () => {
      refs.motionRendererRef.current?.dispose();
      refs.motionRendererRef.current = null;
    }, [refs.motionRendererRef]);
  
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
      const canvas = refs.canvasRef.current;
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
    }, [refs.canvasRef]);
  
    useEffect(() => {
      const videoArea = refs.videoAreaRef.current;
      if (!videoArea) return;
  
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setVideoAreaSize({ width, height });
        }
      });
  
      resizeObserver.observe(videoArea);
      return () => resizeObserver.disconnect();
    }, [refs.videoAreaRef]);
  
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
      const cachedFrame = refs.lastGoodFrameRef.current;
      refs.lastGoodFrameRef.current = null;
      cachedFrame?.close();
    }, [project, proxySourceRevision, refs.lastGoodFrameRef]);
  
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
  
  
  return {
    compact, isMuted, setIsMuted, isRenderBridgeReady, setIsRenderBridgeReady,
    canvasSize, setCanvasSize, videoAreaSize, setVideoAreaSize, setRendererType,
    isMaximized, setIsMaximized, isFullscreen, setIsFullscreen, compactExpanded,
    zoomLevel, setZoomLevel, showZoomMenu, setShowZoomMenu, showQualityMenu,
    setShowQualityMenu, showAspectMenu, setShowAspectMenu, showCompositionGrid, setShowCompositionGrid,
    showSafeMargins, setShowSafeMargins, canvasSnappingEnabled, setCanvasSnappingEnabled, ZOOM_OPTIONS,
    isDark, interactionMode, setInteractionMode, activeHandle, setActiveHandle,
    lockAspectRatio, setLockAspectRatio, STORE_UPDATE_THROTTLE_MS, liveTransform, setLiveTransform,
    canvasSnapGuides, setCanvasSnapGuides, interactionTargetType, setInteractionTargetType, project,
    fontRevision, getOriginalMediaItem, proxySourceRevision, getTitleEngine, getGraphicsEngine,
    getMaskEngine, allShapeClips, allSubtitles, allTextClips, clipMasksById,
    drawClipFrame, failProxyPlayback, getMediaItem, mediaClipHasAudio, mediaClipHasVisual,
    updateClipTransform, updateTextTransform, updateShapeTransform, beginHistoryGroup, endHistoryGroup,
    updateSettings, timelineTracks, settings, editingFrameDuration, canvasFillMode,
    canvasFillColor, playbackQuality, setPlaybackQuality, previewRes, playheadPosition,
    playbackState, playbackLockedReason, playbackRate, loopEnabled, loopStart,
    loopEnd, isScrubbing, pause, togglePlayback, seekTo,
    seekRelative, setPlayheadPosition, isPlaying, renderFrameDirectlyInitializer,
    refs, ...refs,
    cancelPendingScrubDecode,
    evictOldestVideoElement, releaseScrubVideoElements, releaseVideoElement, scheduleScrubVideoRelease, previewFrameSize,
  };
}

export type PreviewSetup1 = ReturnType<typeof usePreviewSetup1>;
