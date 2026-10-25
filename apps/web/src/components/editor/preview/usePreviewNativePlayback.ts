/** Coordinates native video playback for the preview canvas. */
import { useCallback } from "react";
import {
  getMasterClock,
  getRealtimeAudioGraph,
  getVidstabEngine,
  trackHasAudioItems,
  type MediaItem,
  type Project,
  type Subtitle,
  type Track,
} from "@openreel/core";
import { fillPreviewBackground } from "./preview-decode-frame";
import { createNativeVideoLoader } from "./preview-native-playback-loader";
import { createNativePlaybackFrame } from "./preview-native-playback-frame";
import { playVideoElement, syncVideoToClipTime } from "./preview-native-playback-sync";
import type { PreviewClip, PreviewRefs } from "./preview-runtime-types";
import type { usePreviewAudioScheduler } from "./usePreviewAudioScheduler";
import type { usePreviewMedia } from "./usePreviewMedia";
import type { usePreviewMotion } from "./usePreviewMotion";
import type { usePreviewVideoCache } from "./usePreviewVideoCache";

type MediaLookup = ReturnType<typeof usePreviewMedia>;
type MotionHooks = ReturnType<typeof usePreviewMotion>;
type AudioHooks = ReturnType<typeof usePreviewAudioScheduler>;
type VideoCacheHooks = ReturnType<typeof usePreviewVideoCache>;

export interface NativePlaybackOptions {
  refs: PreviewRefs;
  timelineTracks: Track[];
  project: Project;
  previewRes: { scale: number; width: number; height: number };
  actualEndTime: number;
  editingFrameDuration: number;
  allSubtitles: Subtitle[];
  getMediaItem: MediaLookup["getMediaItem"];
  failProxyPlayback: MediaLookup["failProxyPlayback"];
  getAudioClipsForScheduler: AudioHooks["getAudioClipsForScheduler"];
  preDecodeAllAudioBuffers: AudioHooks["preDecodeAllAudioBuffers"];
  isMuted: boolean;
  releaseVideoElement: VideoCacheHooks["releaseVideoElement"];
  hasActiveMotionInstances: MotionHooks["hasActiveMotionInstances"];
  renderOverlayClipsInTrackOrder: MotionHooks["renderOverlayClipsInTrackOrder"];
  mediaClipHasVisual: MediaLookup["mediaClipHasVisual"];
  fillPreviewBackground: typeof fillPreviewBackground;
  setPlayheadPosition: (position: number) => void;
}

export const usePreviewNativePlayback = ({
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
}: NativePlaybackOptions) => {
  const {
    canvasRef,
    nativePlaybackActiveRef,
    nativeImageBitmapCacheRef,
    audioGraphRef,
    timelineTracksRef,
    isScrubbingRef,
    startPositionRef,
    lastPlayheadUpdateRef,
    rateRef,
    videoElementRef,
    currentVideoMediaIdRef,
    lastGoodFrameRef,
    canvasFillModeRef,
    allShapeClipsRef,
    allTextClipsRef,
    playheadPositionRef,
  } = refs;
  return useCallback(
    async (
      clips: Array<{
        clip: (typeof timelineTracks)[0]["clips"][0];
        mediaItem: NonNullable<ReturnType<typeof getMediaItem>>;
      }>,
      imageClips: Array<{
        clip: (typeof timelineTracks)[0]["clips"][0];
        trackIndex: number;
      }>,
      startPosition: number,
      onEnd: () => void,
      shouldContinue: () => boolean,
    ): Promise<() => void> => {
      let isActive = true;
      const isCurrentPlayback = () => isActive && shouldContinue();
      const canvas = canvasRef.current;
      if (!canvas || clips.length === 0) {
        onEnd();
        return () => {};
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onEnd();
        return () => {};
      }

      nativePlaybackActiveRef.current = true;

      const imageBitmapCache = nativeImageBitmapCacheRef.current;
      for (const { clip } of imageClips) {
        if (imageBitmapCache.has(clip.id)) {
          continue;
        }
        const mediaItem = getMediaItem(clip.mediaId);
        if (mediaItem?.type === "image" && mediaItem.blob) {
          try {
            const bitmap = await createImageBitmap(mediaItem.blob);
            if (!isCurrentPlayback()) { bitmap.close(); return () => {}; }
            imageBitmapCache.set(clip.id, bitmap);
          } catch (error) {
            console.warn(`Failed to cache image bitmap for ${clip.id}:`, error);
          }
        }
      }

      if (!isCurrentPlayback()) return () => {};
      preDecodeAllAudioBuffers().catch((error) => {
        console.warn("[Preview] Audio warmup failed:", error);
      });

      const { loadVideoForClip, videoCache } = createNativeVideoLoader({
        refs,
        isCurrentPlayback,
        getMediaItem,
        failProxyPlayback,
      });

      const activeStartClip = clips.find(
        ({ clip }) =>
          startPosition >= clip.startTime &&
          startPosition < clip.startTime + clip.duration,
      );
      if (activeStartClip) {
        await loadVideoForClip(activeStartClip.clip, activeStartClip.mediaItem);
      }
      if (!isCurrentPlayback()) return () => {};

      for (const entry of clips) {
        if (entry !== activeStartClip) {
          loadVideoForClip(entry.clip, entry.mediaItem).catch(() => {});
        }
      }

      const masterClock = getMasterClock();
      masterClock.setDuration(actualEndTime);
      masterClock.seek(startPosition);

      if (!audioGraphRef.current) {
        audioGraphRef.current = getRealtimeAudioGraph();
      }
      const audioGraph = audioGraphRef.current;
      audioGraph.setPreviewMuted(isMuted);

      const tracksWithAudio = timelineTracks.filter(
        (track) => !track.hidden && trackHasAudioItems(project, track.id),
      );
      for (const audioTrack of tracksWithAudio) {
        audioGraph.createTrack({
          trackId: audioTrack.id,
          volume: 1,
          pan: 0,
          muted: audioTrack.muted || false,
          solo: audioTrack.solo || false,
          effects: [],
        });
      }

      await audioGraph.resume();
      if (!isCurrentPlayback()) return () => {};
      audioGraph.seekTo(startPosition);
      const findClipAtTime = (time: number) => {
        for (const { clip, mediaItem } of clips) {
          if (time >= clip.startTime && time < clip.startTime + clip.duration) {
            return { clip, mediaItem };
          }
        }
        return null;
      };

      const findNextNativeClip = (clipId: string) => {
        const sorted = [...clips].sort((a, b) => a.clip.startTime - b.clip.startTime);
        const index = sorted.findIndex(({ clip }) => clip.id === clipId);
        return index >= 0 ? sorted[index + 1] ?? null : null;
      };

      const findNativeClipById = (clipId: string) =>
        clips.find(({ clip }) => clip.id === clipId) ?? null;

      const frameState = { rafId: null as number | null, currentClipId: null as string | null };
      let cleanup: (preserveCaches?: boolean) => void = () => {};
      const drawFrame = createNativePlaybackFrame({ refs, actualEndTime, editingFrameDuration, allSubtitles, isPlaybackActive: () => isActive, hasActiveMotionInstances, renderOverlayClipsInTrackOrder, fillPreviewBackground, setPlayheadPosition, mediaClipHasVisual, clips, imageClips, canvas, ctx, masterClock, videoCache, imageBitmapCache, loadVideoForClip, findClipAtTime, findNextNativeClip, findNativeClipById, cleanup: () => cleanup(), onEnd, state: frameState });

      cleanup = (preserveCaches = false) => {
        isActive = false;
        nativePlaybackActiveRef.current = false;
        if (frameState.rafId) cancelAnimationFrame(frameState.rafId);

        if (preserveCaches) {
          for (const [, entry] of videoCache) {
            entry.video.pause();
          }
        } else {
          for (const [, entry] of videoCache) {
            releaseVideoElement(entry);
          }
          videoCache.clear();
        }

        if (!preserveCaches) {
          for (const [, bitmap] of imageBitmapCache) {
            bitmap.close();
          }
          imageBitmapCache.clear();
        }

        videoElementRef.current = null;
        currentVideoMediaIdRef.current = null;
        if (preserveCaches) {
          masterClock.pause();
        } else {
          masterClock.stop();
        }
        audioGraph.stopScheduler();
      };

      if (activeStartClip) {
        const startupCacheId = getVidstabEngine().hasStabilized(
          activeStartClip.clip.id,
        )
          ? `stabilized:${activeStartClip.clip.id}`
          : activeStartClip.clip.mediaId;
        const startupVideo = videoCache.get(startupCacheId)?.video;
        if (startupVideo) {
          await syncVideoToClipTime(startupVideo, activeStartClip.clip, startPosition);
          if (!isActive || !nativePlaybackActiveRef.current) {
            cleanup(true);
            return () => {};
          }
          await playVideoElement(startupVideo, refs);
        }
      }

      if (!isCurrentPlayback()) return () => {};
      await masterClock.play();
      if (!isCurrentPlayback()) return () => {};
      audioGraph.startScheduler(getAudioClipsForScheduler);
      frameState.rafId = requestAnimationFrame(() => { drawFrame(); });

      return cleanup;
    },
    [
      actualEndTime,
      editingFrameDuration,
      allSubtitles,
      getMediaItem,
      failProxyPlayback,
      getAudioClipsForScheduler,
      isMuted,
      preDecodeAllAudioBuffers,
      releaseVideoElement,
      hasActiveMotionInstances,
      renderOverlayClipsInTrackOrder,
      fillPreviewBackground,
      setPlayheadPosition,
      timelineTracks,
      project,
      mediaClipHasVisual,
      previewRes.scale,
    ],
  );
};
