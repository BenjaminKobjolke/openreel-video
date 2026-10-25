import React from "react";
import { PreviewHeader } from "./preview/PreviewHeader";
import { PreviewStage } from "./preview/PreviewStage";
import { PreviewControlBar } from "./preview/PreviewControlBar";
import { usePreviewSetup } from "./preview/usePreviewSetup";

export const Preview: React.FC = () => {
  const {
    ZOOM_OPTIONS, activeGraphicClips, actualEndTime, canvasSize, canvasSnapGuides,
    canvasSnappingEnabled, clipBounds, compact, compactExpanded, containerRef,
    cropClip, cropMediaType, cropMode, cropVideoSrc, exportState,
    getGraphicClipDisplayBounds, handleClipMouseDown, handleCropCancel, handleCropChange, handleCropComplete,
    handleFullscreen, handleGraphicsClick, handleGraphicsMouseMove, handleHandleMouseDown, handleMaximize,
    handleMotionPathControlPointMove, handleMotionPathPointAdd, handleMotionPathPointMove, handleMotionPathPointRemove, handleMouseMove,
    handleMouseUp, handlePreviewKeyDown, handleShapeClipMouseDown, handleShapeHandleMouseDown, handleSkipBack,
    handleSkipForward, handleTextClipMouseDown, handleTextHandleMouseDown, handleToggleLoop, hoveredGraphicClipId,
    interactionMode, isDark, isFullscreen, isMaximized, isMuted,
    isPlaying, lockAspectRatio, loopEnabled, motionPathClip, motionPathConfig,
    motionPathMode, particleEffects, playbackLockedReason, playbackQuality, playheadPosition,
    previewFrameSize, previewLoopRange, previewRes, refs, selectedShapeClip,
    selectedShapeClipId, setCanvasSnapGuides, setCanvasSnappingEnabled, setHoveredGraphicClipId, setIsMuted,
    setLockAspectRatio, setPlaybackQuality, setShowAspectMenu, setShowCompositionGrid, setShowQualityMenu,
    setShowSafeMargins, setShowZoomMenu, setZoomLevel, settings, shapeClipBounds,
    shouldShowCropMode, showAspectMenu, showCompositionGrid, showQualityMenu, showResizeHandles,
    showSafeMargins, showShapeClipHandles, showSubtitleOverlay, showTextClipHandles, showZoomMenu,
    subtitleBounds, textClipBounds, togglePlayback, updateSettings, videoAreaSize,
    zoomLevel,
  } = usePreviewSetup();
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

      <PreviewStage {...{
        refs, shouldShowCropMode, cropClip, cropVideoSrc, cropMediaType, playheadPosition,
        canvasSize, handleCropChange, handleCropComplete, handleCropCancel,
        interactionMode, handleMouseMove, handleMouseUp, isMaximized, isFullscreen,
        zoomLevel, isDark, previewFrameSize, previewRes, hoveredGraphicClipId, isPlaying,
        handleGraphicsMouseMove, handleGraphicsClick, setHoveredGraphicClipId,
        showCompositionGrid, showSafeMargins, cropMode, canvasSnapGuides, motionPathMode, motionPathConfig,
        motionPathClip, settings, handleMotionPathPointMove, handleMotionPathPointAdd,
        handleMotionPathPointRemove, handleMotionPathControlPointMove, particleEffects,
        showResizeHandles, clipBounds, handleClipMouseDown, lockAspectRatio,
        setLockAspectRatio, handleHandleMouseDown, showTextClipHandles, textClipBounds,
        handleTextClipMouseDown, handleTextHandleMouseDown, showShapeClipHandles,
        shapeClipBounds, selectedShapeClip, handleShapeClipMouseDown,
        handleShapeHandleMouseDown, showSubtitleOverlay, subtitleBounds,
        activeGraphicClips, selectedShapeClipId, getGraphicClipDisplayBounds,
        exportState, videoAreaSize,
      }} />
      <PreviewControlBar {...{
        compact, playheadPosition, actualEndTime, settings, playbackLockedReason,
        isPlaying, handleSkipBack, togglePlayback, handleSkipForward, loopEnabled,
        previewLoopRange, handleToggleLoop, exportState, isMuted, setIsMuted,
        showAspectMenu, setShowAspectMenu, updateSettings, playbackQuality,
        setPlaybackQuality, showQualityMenu, setShowQualityMenu, showZoomMenu,
        setShowZoomMenu, zoomLevel, setZoomLevel, zoomOptions: ZOOM_OPTIONS,
        canvasSnappingEnabled, setCanvasSnappingEnabled, setCanvasSnapGuides,
        showCompositionGrid, setShowCompositionGrid, showSafeMargins, setShowSafeMargins,
        isFullscreen, handleFullscreen, isMaximized, handleMaximize,
      }} />
    </div>
  );
};

export default Preview;
