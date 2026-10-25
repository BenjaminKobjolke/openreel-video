/** Warms preview audio buffers and builds per-frame audio schedules. */
import { useCallback, useEffect } from "react";
import {
  getPreviewAudioEffects,
  getRealtimeAudioGraph,
  getTrackTransitionAudioFades,
  splitProfileAwareNoiseReductionEffects,
  type AudioClipSchedule,
  type Effect,
  type MediaItem,
} from "@openreel/core";
import type { PreviewClip, PreviewRefs } from "./preview-runtime-types";

export const getPreviewAudioBufferCacheKey = (
  mediaId: string,
  audioTrackIndex?: number,
): string => `${mediaId}:${audioTrackIndex ?? 0}`;

export const loadPreviewAudioBuffer = async (
  audioContext: AudioContext | BaseAudioContext,
  blob: Blob,
  audioTrackIndex: number = 0,
): Promise<AudioBuffer | null> => {
  try {
    const { extractAudioWav } = await import("@openreel/core/media");
    const wavBlob = await extractAudioWav(blob, audioTrackIndex);
    const arrayBuffer = await wavBlob.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    if (error instanceof Error && error.name === "NoAudioStreamError") {
      return null;
    }
  }

  if (audioTrackIndex === 0) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    } catch {
      return null;
    }
  }
  return null;
};

interface PreviewAudioSchedulerOptions {
  refs: PreviewRefs;
  timelineTracks: PreviewRefs["timelineTracksRef"]["current"];
  isPlaying: boolean;
  mediaClipHasAudio: (clip: PreviewClip) => boolean;
  getOriginalMediaItem: (id: string) => MediaItem | undefined;
  getAudioEffectSignature: (effects: Effect[]) => string;
  getResolvedClipAudioEffects: (clip: PreviewClip) => Effect[];
  getResolvedClipVolumeAutomation: (clip: PreviewClip) => AudioClipSchedule["volumeAutomation"];
  getPreviewAudioBufferForEffects: (
    audioBuffer: AudioBuffer,
    baseCacheKey: string,
    effects: Effect[],
  ) => Promise<{ audioBuffer: AudioBuffer; effects: Effect[] }>;
}

export const usePreviewAudioScheduler = ({
  refs,
  timelineTracks,
  isPlaying,
  mediaClipHasAudio,
  getOriginalMediaItem,
  getAudioEffectSignature,
  getResolvedClipAudioEffects,
  getResolvedClipVolumeAutomation,
  getPreviewAudioBufferForEffects,
}: PreviewAudioSchedulerOptions) => {
  const {
    audioGraphRef,
    audioBufferCacheRef,
    processedAudioBufferCacheRef,
    noAudioBufferRef,
    timelineTracksRef,
    audioWarmupTimerRef,
    audioWarmupIdleRef,
    isInteractingRef,
  } = refs;

  const preDecodeAllAudioBuffers = useCallback(async (): Promise<void> => {
    const tracks = timelineTracksRef.current;
    const audioTracks = tracks.filter((track) => !track.hidden);

    if (!audioGraphRef.current) {
      audioGraphRef.current = getRealtimeAudioGraph();
    }
    const audioGraph = audioGraphRef.current;
    const audioContext = audioGraph.getAudioContext();

    for (const track of audioTracks) {
      for (const clip of track.clips) {
        if (!mediaClipHasAudio(clip)) {
          continue;
        }
        const cacheKey = getPreviewAudioBufferCacheKey(clip.mediaId, clip.audioTrackIndex);
        let audioBuffer: AudioBuffer | null | undefined =
          audioBufferCacheRef.current.get(cacheKey);

        if (!audioBuffer) {
          if (noAudioBufferRef.current.has(cacheKey)) {
            continue;
          }
          const mediaItem = getOriginalMediaItem(clip.mediaId);
          if (!mediaItem?.blob) {
            continue;
          }

          try {
            audioBuffer = await loadPreviewAudioBuffer(
              audioContext,
              mediaItem.blob,
              clip.audioTrackIndex ?? 0,
            );
            if (audioBuffer) {
              audioBufferCacheRef.current.set(cacheKey, audioBuffer);
            } else {
              noAudioBufferRef.current.add(cacheKey);
            }
          } catch {
            audioBuffer = null;
            noAudioBufferRef.current.add(cacheKey);
          }
        }

        if (audioBuffer) {
          const audioEffects = getResolvedClipAudioEffects(clip).filter(
            (effect: Effect) => effect.enabled,
          );
          if (audioEffects.length > 0) {
            try {
              await getPreviewAudioBufferForEffects(audioBuffer, cacheKey, audioEffects);
            } catch (error) {
              console.warn(
                `[Preview] Failed to pre-process audio effects for clip ${clip.id}:`,
                error,
              );
            }
          }
        }
      }
    }
  }, [
    getOriginalMediaItem,
    getPreviewAudioBufferForEffects,
    getResolvedClipAudioEffects,
    mediaClipHasAudio,
  ]);

  useEffect(() => {
    if (isPlaying) {
      return;
    }

    if (audioWarmupTimerRef.current) {
      clearTimeout(audioWarmupTimerRef.current);
    }

    audioWarmupTimerRef.current = setTimeout(() => {
      audioWarmupTimerRef.current = null;
      if (isInteractingRef.current) {
        return;
      }

      const warm = () => {
        void preDecodeAllAudioBuffers().catch(() => {});
      };

      const idle = (
        window as Window & {
          requestIdleCallback?: (
            cb: () => void,
            opts?: { timeout: number },
          ) => number;
        }
      ).requestIdleCallback;

      if (typeof idle === "function") {
        audioWarmupIdleRef.current = idle(warm, { timeout: 1000 });
      } else {
        warm();
      }
    }, 250);

    return () => {
      if (audioWarmupTimerRef.current) {
        clearTimeout(audioWarmupTimerRef.current);
        audioWarmupTimerRef.current = null;
      }
    };
  }, [timelineTracks, isPlaying, preDecodeAllAudioBuffers]);

  const getAudioClipsForScheduler = useCallback(
    (time: number): AudioClipSchedule[] => {
      const tracks = timelineTracksRef.current;
      const tracksWithAudio = tracks.filter(
        (track) => !track.hidden && !track.muted,
      );
      const schedules: AudioClipSchedule[] = [];

      for (const track of tracksWithAudio) {
        for (const clip of track.clips) {
          if (!mediaClipHasAudio(clip)) {
            continue;
          }
          const clipEnd = clip.startTime + clip.duration;
          if (clipEnd <= time || clip.startTime > time + 1) {
            continue;
          }

          const audioBuffer = audioBufferCacheRef.current.get(
            getPreviewAudioBufferCacheKey(clip.mediaId, clip.audioTrackIndex),
          );
          if (!audioBuffer) {
            continue;
          }

          const audioEffects = getResolvedClipAudioEffects(clip).filter(
            (e: Effect) => e.enabled,
          );
          const previewEffects = getPreviewAudioEffects(audioEffects);
          const { profileAwareNoiseEffects, realtimeEffects } =
            splitProfileAwareNoiseReductionEffects(previewEffects);
          let scheduleAudioBuffer = audioBuffer;
          let scheduleEffects = previewEffects;

          if (profileAwareNoiseEffects.length > 0) {
            const processedCacheKey = `${getPreviewAudioBufferCacheKey(
              clip.mediaId,
              clip.audioTrackIndex,
            )}:profile-denoise:${getAudioEffectSignature(profileAwareNoiseEffects)}`;
            const processedAudioBuffer =
              processedAudioBufferCacheRef.current.get(processedCacheKey);

            if (processedAudioBuffer) {
              scheduleAudioBuffer = processedAudioBuffer;
              scheduleEffects = realtimeEffects;
            }
          }
          const transitionFades = getTrackTransitionAudioFades(track, clip.id);

          schedules.push({
            clipId: clip.id,
            trackId: track.id,
            audioBuffer: scheduleAudioBuffer,
            startTime: clip.startTime,
            endTime: clipEnd,
            mediaOffset: clip.inPoint || 0,
            volume: clip.volume ?? 1,
            volumeAutomation: getResolvedClipVolumeAutomation(clip),
            pan: 0,
            effects: scheduleEffects,
            speed: clip.speed ?? 1,
            fadeIn: Math.max(
              clip.fade?.fadeIn ?? 0,
              transitionFades.fadeIn,
            ),
            fadeOut: Math.max(
              clip.fade?.fadeOut ?? 0,
              transitionFades.fadeOut,
            ),
          });
        }
      }

      return schedules;
    },
    [
      getAudioEffectSignature,
      getResolvedClipAudioEffects,
      getResolvedClipVolumeAutomation,
      mediaClipHasAudio,
    ],
  );

  return { getAudioClipsForScheduler, preDecodeAllAudioBuffers };
};
