/** Renders transition frames while keeping overlay layers above the blend. */
import {
  getSpeedEngine,
} from "@openreel/core";
import {
  getActiveSubtitles,
  getTransitionAtTime,
  renderSubtitleToCanvas,
  renderTransitionCanvas,
} from "./canvas-renderers";
import {
  captureSubjectFrame,
  createTransparentCanvasSource,
  getBehindSubjectStreamId,
  hasBehindSubjectText,
} from "./preview-subject-mask";
import {
  renderShapeClipWithEffects,
  renderTextClipWithSubjectMask,
} from "./preview-layer-effects";
import { scheduleMultiTrackFrame } from "./preview-multitrack-playback-schedule";
import { initClipResources } from "./preview-playback-resources";
import type {
  MultiTrackPlaybackContext,
  MultiTrackPlaybackRun,
  PreviewClip,
} from "./preview-runtime-types";

type PlaybackTransition = NonNullable<ReturnType<typeof getTransitionAtTime>>;

export const renderMultiTrackTransition = async (
  context: MultiTrackPlaybackContext,
  run: MultiTrackPlaybackRun,
  transition: PlaybackTransition,
  currentPlayhead: number,
  activeShapeClips: ReturnType<typeof import("./canvas-renderers").getActiveShapeClips>,
  activeTextClips: ReturnType<typeof import("./canvas-renderers").getActiveTextClips>,
  processFrame: () => void,
): Promise<boolean> => {
  const { refs, editingFrameDuration, setPlayheadPosition, getMediaItem } = context;
  const canvas = refs.canvasRef.current;
  if (!canvas) return false;

  const tracks = refs.timelineTracksRef.current;
  const findClipById = (id: string) => {
    for (let idx = 0; idx < tracks.length; idx++) {
      const found = tracks[idx].clips.find((clip) => clip.id === id);
      if (found) return { clip: found, trackIndex: idx };
    }
    return null;
  };

  const aLookup = findClipById(transition.clipA.id);
  const bLookup = transition.clipB ? findClipById(transition.clipB.id) : null;
  if (!aLookup || (transition.clipB && !bLookup)) return false;

  const lookups = bLookup ? [aLookup, bLookup] : [aLookup];
  for (const lookup of lookups) {
    if (!refs.playbackResourcesRef.current.has(lookup.clip.id)) {
      const resources = await initClipResources(
        lookup.clip,
        lookup.trackIndex,
        context.isActive,
        {
          getMediaItem: context.getMediaItem,
          failProxyPlayback: context.failProxyPlayback,
        },
      );
      if (resources) refs.playbackResourcesRef.current.set(lookup.clip.id, resources);
    }
  }

  const decodeClipFrame = async (
    clip: PreviewClip,
  ): Promise<HTMLCanvasElement | OffscreenCanvas | null> => {
    const resources = refs.playbackResourcesRef.current.get(clip.id);
    if (!resources) return null;
    const speedEngine = getSpeedEngine();
    const localTime = currentPlayhead - clip.startTime;
    const adjustedLocalTime = speedEngine.getSourceTimeAtPlaybackTime(clip.id, localTime);
    const sourceTime = Math.max(
      clip.inPoint,
      Math.min(clip.outPoint, (clip.inPoint || 0) + adjustedLocalTime),
    );
    try {
      const result = await (
        resources.sink as {
          getCanvas: (time: number) => Promise<{
            canvas: HTMLCanvasElement | OffscreenCanvas;
          } | null>;
        }
      ).getCanvas(sourceTime);
      return result?.canvas ?? null;
    } catch (error) {
      console.warn(`[Preview] Transition decode failed for clip ${clip.id}:`, error);
      return null;
    }
  };

  const [clipAFrame, clipBFrame] = await Promise.all([
    decodeClipFrame(aLookup.clip),
    bLookup ? decodeClipFrame(bLookup.clip) : Promise.resolve(null),
  ]);
  const blank = transition.clipB
    ? null
    : createTransparentCanvasSource(canvas.width, canvas.height);
  const outgoing = transition.clipB || transition.edge !== "in" ? clipAFrame : blank;
  const incoming = transition.clipB
    ? clipBFrame
    : transition.edge === "in"
      ? clipAFrame
      : blank;
  if (!outgoing || !incoming) return false;

  try {
    const blended = await renderTransitionCanvas(transition, outgoing, incoming);
    context.fillPreviewBackground(
      run.ctx,
      refs.playheadPositionRef.current,
      canvas.width,
      canvas.height,
    );
    run.ctx.drawImage(blended, 0, 0, canvas.width, canvas.height);

    const subjectFrame = hasBehindSubjectText(activeTextClips)
      ? await captureSubjectFrame(run.ctx, canvas.width, canvas.height)
      : null;
    try {
      for (const shapeClip of activeShapeClips) {
        await renderShapeClipWithEffects(
          run.ctx,
          shapeClip,
          canvas.width,
          canvas.height,
          currentPlayhead,
        );
      }
      for (const textClip of activeTextClips) {
        await renderTextClipWithSubjectMask(
          run.ctx,
          textClip,
          canvas.width,
          canvas.height,
          currentPlayhead,
          subjectFrame,
          true,
          getBehindSubjectStreamId(tracks, currentPlayhead, getMediaItem),
        );
      }
    } finally {
      subjectFrame?.close();
    }
    for (const subtitle of getActiveSubtitles(refs.allSubtitlesRef.current, currentPlayhead)) {
      renderSubtitleToCanvas(
        run.ctx,
        subtitle,
        canvas.width,
        canvas.height,
        currentPlayhead,
      );
    }

    run.mainCtx.drawImage(refs.offscreenCanvasRef.current!, 0, 0);
    run.masterClock.reportVideoTime(currentPlayhead);
    const now = performance.now();
    if (now - refs.lastPlayheadUpdateRef.current >= editingFrameDuration) {
      refs.lastPlayheadUpdateRef.current = now;
      setPlayheadPosition(currentPlayhead);
    }
    const elapsed = now - run.state.lastFrameTimestamp;
    const delay = Math.max(0, run.frameDuration / refs.rateRef.current - elapsed);
    run.state.lastFrameTimestamp = now;
    run.state.isProcessingFrame = false;
    scheduleMultiTrackFrame(context, processFrame, delay);
    return true;
  } catch (error) {
    console.warn(
      "[Preview] Transition render failed, falling back to normal compositing:",
      error,
    );
    return false;
  }
};

