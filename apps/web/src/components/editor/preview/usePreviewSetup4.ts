import { useEffect, useCallback, useState } from "react";
import { useTimelineStore } from "../../../stores/timeline-store";
import { getMasterClock, getClipLocalTime } from "@openreel/core";
import { type ClipTransform, DEFAULT_TRANSFORM, getAnimatedTransform } from "./index";
import type { PreviewClip } from "./preview-runtime-types";
import { snapCanvasPosition } from "./canvas-snapping";
import { resolvePlaybackLoop } from "../../../utils/playback-loop";
import { usePreviewSelection } from "./usePreviewSelection";
import { usePreviewKeyboardNudge } from "./usePreviewKeyboardNudge";
import { usePreviewCropControls, usePreviewCropData, usePreviewSkipControls, usePreviewWindowMode } from "./usePreviewWindowMode";
import { usePreviewClipBounds, usePreviewGraphicBounds } from "./usePreviewBounds";
import { usePreviewPointer, usePreviewPointerEnd, usePreviewPointerRelease, usePreviewPointerStart } from "./usePreviewPointer";
import { usePreviewPointerMove } from "./usePreviewPointerMove";
import type { PreviewSetup3 } from "./usePreviewSetup3";

export function usePreviewSetup4(previous: PreviewSetup3) {
  const {
    STORE_UPDATE_THROTTLE_MS, activeHandle, actualEndTime, allShapeClips, allSubtitles,
    allTextClips, audioGraphRef, beginHistoryGroup, canvasRef, canvasSize,
    canvasSnappingEnabled, cropClipId, cropMode, endHistoryGroup, getMediaItem,
    getTitleEngine, interactionMode, interactionTargetType, isPlaying, liveTransform,
    lockAspectRatio, loopEnd, loopStart, mediaClipHasVisual,
    playheadPosition, processedAudioBufferCacheRef, project, refs, renderFrameDirectly,
    seekRelative, seekTo, select, selectedItems, setActiveHandle,
    setCanvasSnapGuides, setCropMode, setInteractionMode, setInteractionTargetType, setIsFullscreen,
    setIsMaximized, setLiveTransform, setZoomLevel, settings, timelineTracks,
    updateClipTransform, updateShapeTransform, updateTextTransform,
  } = previous;

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
    }, [audioGraphRef, processedAudioBufferCacheRef]);
  
    useEffect(() => {
      if (isPlaying || previewInvalidateCounter === 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      renderFrameDirectly(playheadPosition);
    }, [canvasRef, previewInvalidateCounter, isPlaying, renderFrameDirectly, playheadPosition]);
  
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
  
    const showResizeHandles = Boolean(!isPlaying && selectedClip && clipBounds);
  
    const showTextClipHandles = Boolean(!isPlaying && selectedTextClip && textClipBounds);
  
  
    const showShapeClipHandles = Boolean(
      !isPlaying && selectedShapeClip && shapeClipBounds,
    );
  
    const showSubtitleOverlay = Boolean(
      !isPlaying && selectedSubtitleObj && subtitleBounds,
    );
  
    const { cropClip, cropMediaData, cropVideoSrc, cropMediaType } = usePreviewCropData(cropMode, cropClipId, timelineTracks, getMediaItem);
    const shouldShowCropMode = Boolean(cropMode && cropClipId && cropClip && cropVideoSrc);
  
  
  return { ...previous,
    previewInvalidateCounter, setPreviewInvalidateCounter, selectedClipId, selectedClip, clipAtPlayhead,
    selectedTextClipId, selectedTextClip, selectedShapeClipId, selectedShapeClip, activeTextClip,
    activeShapeClip, getTransformAtPlayhead, clipBounds, textClipBounds, handlePreviewKeyDown,
    hoveredGraphicClipId, setHoveredGraphicClipId, activeGraphicClips, shapeClipBounds, getGraphicClipDisplayBounds,
    findGraphicClipAtPoint, selectedSubtitleId, selectedSubtitleObj, subtitleBounds, handleHandleMouseDown,
    handleClipMouseDown, handleTextClipMouseDown, handleTextHandleMouseDown, handleShapeClipMouseDown, handleShapeHandleMouseDown,
    handleGraphicsMouseMove, handleGraphicsClick, handleMouseMove, handleMouseUp, handleCropChange,
    handleCropComplete, handleCropCancel, handleSkipBack, handleSkipForward, handleFullscreen,
    handleMaximize, previewLoopRange, handleToggleLoop, showResizeHandles, showTextClipHandles,
    showShapeClipHandles, showSubtitleOverlay, cropClip, cropMediaData, cropVideoSrc,
    cropMediaType, shouldShowCropMode,
  };
}

export type PreviewSetup4 = ReturnType<typeof usePreviewSetup4>;
