/** Runs preview playback in its original effect position. */
import { useEffect } from "react";
import {
  getMasterClock,
  type MediaItem,
  type Project,
  type RealtimeAudioGraph,
} from "@openreel/core";
import { previewProxyCache } from "../../../stores/preview-proxy-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { resolvePlaybackLoop, resolvePlaybackStart } from "../../../utils/playback-loop";
import { startMultiTrackPlayback } from "./preview-multitrack-playback";
import type { PreviewRefs } from "./preview-runtime-types";
import type { usePreviewAudio } from "./usePreviewAudio";
import type { usePreviewAudioScheduler } from "./usePreviewAudioScheduler";
import type { usePreviewFallbackRender } from "./usePreviewFallbackRender";
import type { usePreviewMedia } from "./usePreviewMedia";
import type { usePreviewMotion } from "./usePreviewMotion";
import type { usePreviewNativePlayback } from "./usePreviewNativePlayback";

type MediaLookup = ReturnType<typeof usePreviewMedia>;
type AudioHooks = ReturnType<typeof usePreviewAudioScheduler>;
type MotionHooks = ReturnType<typeof usePreviewMotion>;
type FallbackRender = ReturnType<typeof usePreviewFallbackRender>;

export interface PreviewPlaybackOptions {
  refs: PreviewRefs;
  project: Project;
  previewRes: { width: number; height: number; scale: number };
  actualEndTime: number;
  editingFrameDuration: number;
  isMuted: boolean;
  isPlaying: boolean;
  setPlayheadPosition: (time: number) => void;
  pause: () => void;
  getMediaItem: MediaLookup["getMediaItem"];
  getOriginalMediaItem: (id: string) => MediaItem | undefined;
  failProxyPlayback: MediaLookup["failProxyPlayback"];
  proxySourceRevision: number;
  canUseNativeVideoPlayback: FallbackRender["canUseNativeVideoPlayback"];
  startNativeVideoPlayback: ReturnType<typeof usePreviewNativePlayback>;
  cleanupPlaybackResources: () => void;
  cleanupAudioResources: () => void;
  setupAudioFromAudioTrack: ReturnType<typeof usePreviewAudio>["setupAudioFromAudioTrack"];
  preDecodeAllAudioBuffers: AudioHooks["preDecodeAllAudioBuffers"];
  getAudioClipsForScheduler: Parameters<RealtimeAudioGraph["startScheduler"]>[0];
  hasActiveMotionInstances: MotionHooks["hasActiveMotionInstances"];
  renderMotionInstancesForTrack: MotionHooks["renderMotionInstancesForTrack"];
  mediaClipHasAudio: MediaLookup["mediaClipHasAudio"];
  mediaClipHasVisual: MediaLookup["mediaClipHasVisual"];
  clipMasksById: MediaLookup["clipMasksById"];
  drawClipFrame: MediaLookup["drawClipFrame"];
  fillPreviewBackground: (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    time: number,
    width: number,
    height: number,
  ) => void;
}

export const usePreviewPlayback = (options: PreviewPlaybackOptions) => {
  const {
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
  } = options;
  const {
    animationRef,
    canvasRef,
    nativePlaybackActiveRef,
    startPositionRef,
    videoElementRef,
    videoUrlRef,
  } = refs;
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
      await startMultiTrackPlayback({
        refs,
        project,
        previewRes,
        actualEndTime,
        playbackStartPosition,
        editingFrameDuration,
        isMuted,
        isActive: () => isActive,
        pause: () => pause(),
        setPlayheadPosition,
        cleanupPlaybackResources,
        cleanupAudioResources,
        getMediaItem,
        failProxyPlayback,
        getAudioClipsForScheduler,
        preDecodeAllAudioBuffers,
        mediaClipHasVisual,
        mediaClipHasAudio,
        hasActiveMotionInstances,
        renderMotionInstancesForTrack,
        drawClipFrame,
        fillPreviewBackground,
        clipMasksById,
      });
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


};
