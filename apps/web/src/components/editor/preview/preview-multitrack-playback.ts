/** Starts preview playback across video, overlays, motion, and audio tracks. */
import {
  getActiveShapeClips,
  getActiveTextClips,
  getMasterClock,
  getRealtimeAudioGraph,
  trackHasAudioItems,
} from "@openreel/core";
import { resolvePlaybackLoop } from "../../../utils/playback-loop";
import { findAllClipsAtTime, findNextClipStartTime } from "./preview-playback-clips";
import { initClipResources, preCacheAllImageBitmaps } from "./preview-playback-resources";
import type {
  MultiTrackPlaybackContext,
  MultiTrackPlaybackRun,
} from "./preview-runtime-types";
import { processMultiTrackFrame } from "./preview-multitrack-playback-frame";

export const startMultiTrackPlayback = async (
  context: MultiTrackPlaybackContext,
): Promise<void> => {
  const {
    refs,
    project,
    playbackStartPosition,
    actualEndTime,
    editingFrameDuration,
    isMuted,
    isActive,
    pause,
    getMediaItem,
    failProxyPlayback,
    preDecodeAllAudioBuffers,
    getAudioClipsForScheduler,
    mediaClipHasVisual,
    mediaClipHasAudio,
    hasActiveMotionInstances,
  } = context;
  const canvas = refs.canvasRef.current;
  if (!canvas) return;

  const initialClips = findAllClipsAtTime(
    refs.timelineTracksRef.current,
    playbackStartPosition,
    mediaClipHasVisual,
  );
  const activeTextClips = getActiveTextClips(
    refs.allTextClipsRef.current,
    playbackStartPosition,
  );
  const activeShapeClips = getActiveShapeClips(
    refs.allShapeClipsRef.current,
    playbackStartPosition,
  );
  const audioTracks = refs.timelineTracksRef.current.filter((track) => !track.hidden);
  const hasActiveAudioClip = audioTracks.some((track) =>
    track.clips.some(
      (clip) =>
        mediaClipHasAudio(clip) &&
        playbackStartPosition >= clip.startTime &&
        playbackStartPosition < clip.startTime + clip.duration,
    ),
  );

  const hasAnyVisualContent =
    initialClips.length > 0 ||
    activeTextClips.length > 0 ||
    activeShapeClips.length > 0 ||
    hasActiveMotionInstances(playbackStartPosition);
  const hasAnyContent = hasAnyVisualContent || hasActiveAudioClip;

  if (!hasAnyContent && actualEndTime <= 0) {
    pause();
    return;
  }

  preCacheAllImageBitmaps(refs, refs.timelineTracksRef.current, getMediaItem).catch((error) => {
    console.warn("[Preview] Image warmup failed:", error);
  });

  for (const { clip, trackIndex } of initialClips) {
    if (!refs.playbackResourcesRef.current.has(clip.id)) {
      const resources = await initClipResources(
        clip,
        trackIndex,
        isActive,
        { getMediaItem, failProxyPlayback },
      );
      if (resources) refs.playbackResourcesRef.current.set(clip.id, resources);
    }
  }

  const hasTextOrShapeContent =
    activeTextClips.length > 0 ||
    activeShapeClips.length > 0 ||
    hasActiveMotionInstances(playbackStartPosition);
  if (
    refs.playbackResourcesRef.current.size === 0 &&
    !hasTextOrShapeContent &&
    !hasActiveAudioClip &&
    actualEndTime <= 0
  ) {
    pause();
    return;
  }

  preDecodeAllAudioBuffers().catch((error) => {
    console.warn("[Preview] Audio warmup failed:", error);
  });

  if (!refs.audioGraphRef.current) {
    refs.audioGraphRef.current = getRealtimeAudioGraph();
  }
  const audioGraph = refs.audioGraphRef.current;
  audioGraph.setPreviewMuted(isMuted);

  const tracksWithAudio = refs.timelineTracksRef.current.filter(
    (track) => !track.hidden && trackHasAudioItems(project, track.id),
  );
  for (const track of tracksWithAudio) {
    audioGraph.createTrack({
      trackId: track.id,
      volume: 1,
      pan: 0,
      muted: track.muted || false,
      solo: track.solo || false,
      effects: [],
    });
  }

  await audioGraph.resume();

  const mainCtx = canvas.getContext("2d");
  if (!mainCtx) {
    console.error("[Preview] Failed to get 2D context");
    pause();
    return;
  }

  if (
    !refs.offscreenCanvasRef.current ||
    refs.offscreenCanvasRef.current.width !== canvas.width ||
    refs.offscreenCanvasRef.current.height !== canvas.height
  ) {
    refs.offscreenCanvasRef.current = new OffscreenCanvas(
      canvas.width,
      canvas.height,
    );
    refs.offscreenCtxRef.current = refs.offscreenCanvasRef.current.getContext(
      "2d",
    ) as OffscreenCanvasRenderingContext2D;
  }

  const ctx = refs.offscreenCtxRef.current as unknown as CanvasRenderingContext2D;
  if (!ctx) {
    console.error("[Preview] Failed to get offscreen 2D context");
    pause();
    return;
  }

  const masterClock = getMasterClock();
  masterClock.setDuration(actualEndTime);
  masterClock.seek(playbackStartPosition);
  audioGraph.seekTo(playbackStartPosition);
  await masterClock.play();
  audioGraph.startScheduler(getAudioClipsForScheduler);

  const run: MultiTrackPlaybackRun = {
    state: {
      lastFrameTimestamp: performance.now(),
      isProcessingFrame: false,
    },
    frameDuration: editingFrameDuration,
    masterClock,
    audioGraph,
    mainCtx,
    ctx,
  };
  const processFrame = () => processMultiTrackFrame(context, run, processFrame);
  refs.animationRef.current = requestAnimationFrame(processFrame);
};

