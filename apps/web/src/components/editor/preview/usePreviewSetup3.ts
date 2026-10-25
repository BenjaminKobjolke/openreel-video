import { useEffect, useCallback } from "react";
import { useTimelineStore } from "../../../stores/timeline-store";
import { setImageLoadCallback } from "./index";
import { usePreviewNativePlayback } from "./usePreviewNativePlayback";
import { usePreviewRefMirror } from "./usePreviewRefMirrors";
import { usePreviewMotion } from "./usePreviewMotion";
import { usePreviewAudio } from "./usePreviewAudio";
import { usePreviewAudioScheduler } from "./usePreviewAudioScheduler";
import { usePreviewPlayback } from "./usePreviewPlayback";
import { usePreviewModifiedRender } from "./usePreviewModifiedRender";
import { usePreviewDirectRender } from "./usePreviewDirectRender";
import { usePreviewFallbackRender } from "./usePreviewFallbackRender";
import { decodePreviewClipFrame, fillPreviewBackground as fillPreviewCanvasBackground } from "./preview-decode-frame";
import type { PreviewSetup2 } from "./usePreviewSetup2";

export function usePreviewSetup3(previous: PreviewSetup2) {
  const {
    actualEndTime, allShapeClips, allSubtitles, allTextClips, audioGraphRef,
    audioSourceRef, clipMasksById, drawClipFrame, editingFrameDuration, evictOldestVideoElement,
    failProxyPlayback, fontRevision, gainNodeRef, getMediaItem, getOriginalMediaItem,
    imageBitmapCacheRef, isDark, isMuted, isPlaying, isPlayingRef,
    isScrubbing, mediaClipHasAudio, mediaClipHasVisual, motionAssetBitmapCacheRef, pause,
    playbackResourcesRef, playheadPosition, playheadPositionRef, previewRes, project,
    proxySourceRevision, refs, releaseScrubVideoElements, releaseVideoElement, renderFrameDirectlyInitializer,
    renderFrameDirectlyRef, scheduleScrubVideoRelease, setPlayheadPosition, timelineTracks,
  } = previous;

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
    }, [imageBitmapCacheRef, motionAssetBitmapCacheRef, playbackResourcesRef]);
  
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
    }, [audioGraphRef, audioSourceRef]);
  
    useEffect(() => {
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = isMuted ? 0 : 1;
      }
      if (audioGraphRef.current) {
        audioGraphRef.current.setPreviewMuted(isMuted);
      }
    }, [audioGraphRef, gainNodeRef, isMuted]);
  
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
      [evictOldestVideoElement, failProxyPlayback, getMediaItem, refs, releaseVideoElement, scheduleScrubVideoRelease],
    );
  
    const fillPreviewBackground = useCallback(
      (
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        time: number,
        width: number,
        height: number,
      ): void => fillPreviewCanvasBackground(refs, ctx, time, width, height),
      [refs],
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
    }, [fontRevision, renderFrameDirectlyRef]);
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
    }, [isPlayingRef, playheadPositionRef, renderFrameDirectlyRef]);
  
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
  
  
  return { ...previous,
    cleanupPlaybackResources, cleanupAudioResources, getAudioEffectSignature, getPreviewAudioBufferForEffects, getResolvedClipAudioEffects,
    getResolvedClipVolumeAutomation, setupAudioFromAudioTrack, hasActiveMotionInstances, renderMotionInstancesForTrack, renderOverlayClipsInTrackOrder,
    getAudioClipsForScheduler, preDecodeAllAudioBuffers, decodeClipFrame, fillPreviewBackground, renderFrameDirectly,
    renderFallbackFrame, canUseNativeVideoPlayback, startNativeVideoPlayback,
  };
}

export type PreviewSetup3 = ReturnType<typeof usePreviewSetup3>;
