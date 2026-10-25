/** Advances the multitrack playback clock and chooses each frame's render path. */
import {
  getActiveShapeClips,
  getActiveTextClips,
  getTransitionAtTime,
} from "./canvas-renderers";
import { resolvePlaybackLoop } from "../../../utils/playback-loop";
import {
  findAllClipsAtTime,
  findNextClipStartTime,
} from "./preview-playback-clips";
import { initClipResources } from "./preview-playback-resources";
import { renderMultiTrackTransition } from "./preview-multitrack-playback-transition";
import { scheduleMultiTrackFrame } from "./preview-multitrack-playback-schedule";
import { renderMultiTrackContent } from "./preview-multitrack-playback-render";
import { useTimelineStore } from "../../../stores/timeline-store";
import type {
  MultiTrackPlaybackContext,
  MultiTrackPlaybackRun,
} from "./preview-runtime-types";

export const processMultiTrackFrame = async (
  context: MultiTrackPlaybackContext,
  run: MultiTrackPlaybackRun,
  processFrame: () => void,
): Promise<void> => {
  const { refs, actualEndTime, editingFrameDuration, isActive, pause } = context;
  const { state, masterClock, audioGraph } = run;
  const canvas = refs.canvasRef.current;
  if (!canvas) return;

  if (!isActive()) {
    context.cleanupPlaybackResources();
    masterClock.pause();
    return;
  }

  if (state.isProcessingFrame) return;
  state.isProcessingFrame = true;
  const currentPlayhead = masterClock.currentTime;

  try {
    if (currentPlayhead >= actualEndTime) {
      state.isProcessingFrame = false;
      context.cleanupPlaybackResources();
      context.cleanupAudioResources();
      masterClock.stop();
      context.setPlayheadPosition(0);
      refs.startPositionRef.current = 0;
      pause();
      return;
    }

    if (!masterClock.isPlaying) {
      state.isProcessingFrame = false;
      context.cleanupPlaybackResources();
      context.cleanupAudioResources();
      if (!refs.isScrubbingRef.current) pause();
      return;
    }

    const nowPlayhead = performance.now();
    if (nowPlayhead - refs.lastPlayheadUpdateRef.current >= editingFrameDuration) {
      refs.lastPlayheadUpdateRef.current = nowPlayhead;
      context.setPlayheadPosition(currentPlayhead);
    }

    const activeClips = findAllClipsAtTime(
      refs.timelineTracksRef.current,
      currentPlayhead,
      context.mediaClipHasVisual,
    );
    const currentTextClips = getActiveTextClips(
      refs.allTextClipsRef.current,
      currentPlayhead,
    );
    const currentShapeClips = getActiveShapeClips(
      refs.allShapeClipsRef.current,
      currentPlayhead,
    );
    const audioTracks = refs.timelineTracksRef.current.filter(
      (track) => !track.hidden,
    );
    const hasCurrentAudioClip = audioTracks.some((track) =>
      track.clips.some(
        (clip) =>
          context.mediaClipHasAudio(clip) &&
          currentPlayhead >= clip.startTime &&
          currentPlayhead < clip.startTime + clip.duration,
      ),
    );
    const hasVisualContent =
      activeClips.length > 0 ||
      currentTextClips.length > 0 ||
      currentShapeClips.length > 0 ||
      context.hasActiveMotionInstances(currentPlayhead);

    if (!hasVisualContent && !hasCurrentAudioClip) {
      if (resolvePlaybackLoop(useTimelineStore.getState(), actualEndTime)) {
        // Preserve empty portions of the marked range while looping.
        // Skipping to later content could jump beyond the loop's out point.
        context.fillPreviewBackground(
          run.mainCtx,
          currentPlayhead,
          canvas.width,
          canvas.height,
        );
        masterClock.reportVideoTime(currentPlayhead);
        state.isProcessingFrame = false;
        refs.animationRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const nextTime = findNextMultiTrackContentTime(context, currentPlayhead);
      if (nextTime !== null) {
        masterClock.seek(nextTime);
        audioGraph.seekTo(nextTime);
        state.isProcessingFrame = false;
        refs.animationRef.current = requestAnimationFrame(processFrame);
        return;
      }

      state.isProcessingFrame = false;
      context.cleanupPlaybackResources();
      context.cleanupAudioResources();
      if (!refs.isScrubbingRef.current) {
        masterClock.stop();
        context.setPlayheadPosition(0);
        refs.startPositionRef.current = 0;
        pause();
      }
      return;
    }

    if (activeClips.some(({ clip }) => typeof clip.metadata?.compoundClipId === "string")) {
      await refs.renderFrameDirectlyRef.current(currentPlayhead);
      masterClock.reportVideoTime(currentPlayhead);
      const now = performance.now();
      const elapsed = now - state.lastFrameTimestamp;
      const delay = Math.max(0, run.frameDuration / refs.rateRef.current - elapsed);
      state.lastFrameTimestamp = now;
      state.isProcessingFrame = false;
      scheduleMultiTrackFrame(context, processFrame, delay);
      return;
    }

    for (const { clip, trackIndex } of activeClips) {
      if (!refs.playbackResourcesRef.current.has(clip.id)) {
        const resources = await initClipResources(
          clip,
          trackIndex,
          isActive,
          {
            getMediaItem: context.getMediaItem,
            failProxyPlayback: context.failProxyPlayback,
          },
        );
        if (resources) refs.playbackResourcesRef.current.set(clip.id, resources);
      }
    }

    const transition = getTransitionAtTime(
      currentPlayhead,
      refs.timelineTracksRef.current,
      context.mediaClipHasVisual,
    );
    const activeShapeClips = getActiveShapeClips(
      refs.allShapeClipsRef.current,
      currentPlayhead,
    );
    const activeTextClips = getActiveTextClips(
      refs.allTextClipsRef.current,
      currentPlayhead,
    );

    // Transitions take over the frame; the overlay layers remain above the blend.
    if (
      transition &&
      (await renderMultiTrackTransition(
        context,
        run,
        transition,
        currentPlayhead,
        activeShapeClips,
        activeTextClips,
        processFrame,
      ))
    ) {
      return;
    }

    await renderMultiTrackContent(
      context,
      run,
      currentPlayhead,
      activeClips,
      currentTextClips,
      currentShapeClips,
      activeTextClips,
      activeShapeClips,
    );

    masterClock.reportVideoTime(currentPlayhead);
    const now = performance.now();
    const elapsed = now - state.lastFrameTimestamp;
    const targetTime = run.frameDuration / refs.rateRef.current;
    const delay = Math.max(0, targetTime - elapsed);
    state.lastFrameTimestamp = now;
    state.isProcessingFrame = false;
    scheduleMultiTrackFrame(context, processFrame, delay);
  } catch (error) {
    state.isProcessingFrame = false;
    console.error("[Preview] Multi-track frame error:", error);
    context.cleanupPlaybackResources();
    pause();
  }
};

const findNextMultiTrackContentTime = (
  context: MultiTrackPlaybackContext,
  afterTime: number,
): number | null => {
  const { refs, project, mediaClipHasVisual, mediaClipHasAudio } = context;
  const nextTimes = [
    findNextClipStartTime(refs.timelineTracksRef.current, afterTime, mediaClipHasVisual),
    findNextStartTime(refs.allTextClipsRef.current, afterTime),
    findNextStartTime(refs.allShapeClipsRef.current, afterTime),
    findNextStartTime(project.motionInstances ?? [], afterTime),
    findNextStartTime(
      refs.timelineTracksRef.current
        .filter((track) => !track.hidden)
        .flatMap((track) => track.clips)
        .filter(mediaClipHasAudio),
      afterTime,
    ),
  ].filter((time): time is number => time !== null && time < context.actualEndTime);
  return nextTimes.length > 0 ? Math.min(...nextTimes) : null;
};

const findNextStartTime = (
  clips: readonly { startTime: number }[],
  afterTime: number,
): number | null => {
  let nextStart: number | null = null;
  for (const clip of clips) {
    if (clip.startTime > afterTime && (nextStart === null || clip.startTime < nextStart)) {
      nextStart = clip.startTime;
    }
  }
  return nextStart;
};
