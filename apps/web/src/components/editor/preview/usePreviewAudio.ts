/** Decodes, preprocesses and schedules audio used by preview playback. */
import { useCallback } from "react";
import {
  getRealtimeAudioGraph,
  getSpeedEngine,
  getPreviewAudioEffects,
  initializeAudioEffectsEngine,
  resolveClipAudioEffects as resolveTimelineClipAudioEffects,
  resolveClipVolumeAutomation,
  splitProfileAwareNoiseReductionEffects,
  getTrackTransitionAudioFades,
  trackHasAudioItems,
  type AudioClipSchedule,
  type AudioEffectParams,
  type Effect,
  type MediaItem,
  type Project,
} from "@openreel/core";
import type { PreviewClip, PreviewRefs } from "./preview-runtime-types";
import {
  getPreviewAudioBufferCacheKey,
  loadPreviewAudioBuffer,
} from "./usePreviewAudioScheduler";

interface PreviewAudioOptions {
  refs: PreviewRefs;
  project: Project;
  isMuted: boolean;
  getOriginalMediaItem: (id: string) => MediaItem | undefined;
  mediaClipHasAudio: (clip: PreviewClip) => boolean;
}

export const usePreviewAudio = ({
  refs,
  project,
  isMuted,
  getOriginalMediaItem,
  mediaClipHasAudio,
}: PreviewAudioOptions) => {
  const {
    audioGraphRef,
    audioBufferCacheRef,
    processedAudioBufferCacheRef,
    noAudioBufferRef,
    timelineTracksRef,
  } = refs;

  const getAudioBufferCacheKey = getPreviewAudioBufferCacheKey;

  const getAudioEffectSignature = useCallback((effects: Effect[]): string =>
    JSON.stringify(
      effects.map((effect) => ({
        id: effect.id,
        type: effect.type,
        enabled: effect.enabled,
        params: effect.params,
        metadata: effect.metadata,
      })),
    ), []);

  const getPreviewAudioBufferForEffects = useCallback(
    async (
      audioBuffer: AudioBuffer,
      baseCacheKey: string,
      effects: Effect[],
    ): Promise<{ audioBuffer: AudioBuffer; effects: Effect[] }> => {
      const previewEffects = getPreviewAudioEffects(
        effects.filter((effect) => effect.enabled),
      );
      const { profileAwareNoiseEffects, realtimeEffects } =
        splitProfileAwareNoiseReductionEffects(previewEffects);

      if (profileAwareNoiseEffects.length === 0) {
        return { audioBuffer, effects: realtimeEffects };
      }

      const processedCacheKey = `${baseCacheKey}:profile-denoise:${getAudioEffectSignature(profileAwareNoiseEffects)}`;
      const cached = processedAudioBufferCacheRef.current.get(processedCacheKey);
      if (cached) {
        return { audioBuffer: cached, effects: realtimeEffects };
      }

      const effectsEngine = await initializeAudioEffectsEngine();
      let processedBuffer = audioBuffer;

      for (const effect of profileAwareNoiseEffects) {
        const params = effect.params as AudioEffectParams["noiseReduction"];
        if (!params.profile) {
          continue;
        }

        processedBuffer = await effectsEngine.applyNoiseReductionWithProfileData(
          processedBuffer,
          params.profile,
          params.reduction ?? 0.5,
          params.focus ?? "balanced",
          params.threshold ?? -40,
        );
      }

      processedAudioBufferCacheRef.current.set(processedCacheKey, processedBuffer);
      return { audioBuffer: processedBuffer, effects: realtimeEffects };
    },
    [getAudioEffectSignature],
  );

  const getResolvedClipAudioEffects = useCallback((clip: PreviewClip): Effect[] => {
    return resolveTimelineClipAudioEffects(clip, {
      tracks: timelineTracksRef.current,
    });
  }, []);

  const getResolvedClipVolumeAutomation = useCallback((clip: PreviewClip) =>
    resolveClipVolumeAutomation(clip, {
      tracks: timelineTracksRef.current,
    }), []);

  const setupAudioFromAudioTrack = useCallback(
    async (timelinePosition: number): Promise<void> => {
      const tracks = timelineTracksRef.current;
      const audioTracks = tracks.filter(
        (track) => !track.hidden && trackHasAudioItems(project, track.id),
      );

      if (!audioGraphRef.current) {
        audioGraphRef.current = getRealtimeAudioGraph();
      }
      const audioGraph = audioGraphRef.current;
      audioGraph.setPreviewMuted(isMuted);

      const speedEngine = getSpeedEngine();
      const scheduledClips: AudioClipSchedule[] = [];

      for (const audioTrack of audioTracks) {
        audioGraph.createTrack({
          trackId: audioTrack.id,
          volume: 1,
          pan: 0,
          muted: audioTrack.muted || false,
          solo: audioTrack.solo || false,
          effects: [],
        });

        if (audioTrack.muted) {
          continue;
        }

        for (const audioClip of audioTrack.clips) {
          if (!mediaClipHasAudio(audioClip)) {
            continue;
          }
          const clipEnd = audioClip.startTime + audioClip.duration;

          if (
            timelinePosition >= audioClip.startTime &&
            timelinePosition < clipEnd
          ) {
            const mediaItem = getOriginalMediaItem(audioClip.mediaId);
            if (!mediaItem?.blob) {
              continue;
            }

            const audioCacheKey = getAudioBufferCacheKey(
              audioClip.mediaId,
              audioClip.audioTrackIndex,
            );
            let audioBuffer = audioBufferCacheRef.current.get(audioCacheKey);
            if (!audioBuffer) {
              if (noAudioBufferRef.current.has(audioCacheKey)) {
                continue;
              }
              try {
                const audioContext = audioGraph.getAudioContext();
                const loaded = await loadPreviewAudioBuffer(
                  audioContext,
                  mediaItem.blob,
                  audioClip.audioTrackIndex ?? 0,
                );
                if (!loaded) {
                  noAudioBufferRef.current.add(audioCacheKey);
                  continue;
                }
                audioBuffer = loaded;
                audioBufferCacheRef.current.set(audioCacheKey, audioBuffer);
              } catch (error) {
                console.warn(
                  `[Preview] Failed to decode audio for clip ${audioClip.id}:`,
                  error,
                );
                continue;
              }
            }

            const audioEffects = getResolvedClipAudioEffects(audioClip);

            const enabledEffects = audioEffects.filter(
              (e: Effect) => e.enabled,
            );
            const previewAudio = await getPreviewAudioBufferForEffects(
              audioBuffer,
              audioCacheKey,
              enabledEffects,
            );

            audioGraph.updateTrackEffects(audioTrack.id, previewAudio.effects);

            const clipLocalTime = timelinePosition - audioClip.startTime;
            const isReverse = speedEngine.isReverse(audioClip.id);
            const transitionFades = getTrackTransitionAudioFades(
              audioTrack,
              audioClip.id,
            );

            let mediaOffset = (audioClip.inPoint || 0) + clipLocalTime;
            if (isReverse) {
              mediaOffset = audioBuffer.duration - mediaOffset;
              mediaOffset = Math.max(0, mediaOffset);
            }

            scheduledClips.push({
              clipId: audioClip.id,
              trackId: audioTrack.id,
              audioBuffer: previewAudio.audioBuffer,
              startTime: audioClip.startTime,
              endTime: clipEnd,
              mediaOffset,
              volume: audioClip.volume ?? 1,
              volumeAutomation: getResolvedClipVolumeAutomation(audioClip),
              pan: 0,
              effects: previewAudio.effects,
              speed: audioClip.speed ?? 1,
              fadeIn: Math.max(
                audioClip.fade?.fadeIn ?? 0,
                transitionFades.fadeIn,
              ),
              fadeOut: Math.max(
                audioClip.fade?.fadeOut ?? 0,
                transitionFades.fadeOut,
              ),
            });
          }
        }
      }

      if (scheduledClips.length > 0) {
        await audioGraph.resume();
        audioGraph.scheduleClips(scheduledClips);
      }
    },
    [
      getOriginalMediaItem,
      getPreviewAudioBufferForEffects,
      getResolvedClipAudioEffects,
      getResolvedClipVolumeAutomation,
      isMuted,
      mediaClipHasAudio,
      project,
    ],
  );

  return {
    getAudioEffectSignature,
    getPreviewAudioBufferForEffects,
    getResolvedClipAudioEffects,
    getResolvedClipVolumeAutomation,
    setupAudioFromAudioTrack,
  };
};
