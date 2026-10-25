/** Composites decoded multitrack frames with their overlays. */
import { getVisibleTrackRenderOrder } from "@openreel/core";
import {
  drawFrameWithTransform,
  getActiveSubtitles,
  renderSubtitleToCanvas,
} from "./canvas-renderers";
import { drawBlurredBackdrop } from "./preview-aspect";
import {
  decodeMultiTrackFrames,
  type DecodedMultiTrackFrame,
} from "./preview-multitrack-playback-decode";
import { renderAllLayersWithGPU } from "./preview-gpu-layers";
import { captureSubjectFrame, getBehindSubjectStreamId } from "./preview-subject-mask";
import {
  renderShapeClipWithEffects,
  renderTextClipWithSubjectMask,
} from "./preview-layer-effects";
import type { PlaybackClipAtTime } from "./preview-playback-clips";
import type {
  GPULayer,
  MultiTrackPlaybackContext,
  MultiTrackPlaybackRun,
} from "./preview-runtime-types";

export const renderMultiTrackContent = async (
  context: MultiTrackPlaybackContext,
  run: MultiTrackPlaybackRun,
  currentPlayhead: number,
  activeClips: PlaybackClipAtTime[],
  currentTextClips: ReturnType<typeof import("./canvas-renderers").getActiveTextClips>,
  currentShapeClips: ReturnType<typeof import("./canvas-renderers").getActiveShapeClips>,
  activeTextClips: ReturnType<typeof import("./canvas-renderers").getActiveTextClips>,
  activeShapeClips: ReturnType<typeof import("./canvas-renderers").getActiveShapeClips>,
): Promise<void> => {
  const { refs, hasActiveMotionInstances } = context;
  const canvas = refs.canvasRef.current;
  if (!canvas) return;

  const { validFrames, validVideoFrames, activeTextNeedsSubject } = await decodeMultiTrackFrames(
    context,
    currentPlayhead,
    activeClips,
    activeTextClips,
  );

  if (
    validFrames.length > 0 ||
    currentTextClips.length > 0 ||
    currentShapeClips.length > 0 ||
    hasActiveMotionInstances(currentPlayhead)
  ) {
    await renderVisibleFrame(
      context,
      run,
      currentPlayhead,
      validFrames,
      validVideoFrames,
      activeTextNeedsSubject,
      activeTextClips,
      activeShapeClips,
    );
  } else if (refs.lastGoodFrameRef.current) {
    run.ctx.drawImage(refs.lastGoodFrameRef.current, 0, 0, canvas.width, canvas.height);
    for (const subtitle of getActiveSubtitles(refs.allSubtitlesRef.current, currentPlayhead)) {
      renderSubtitleToCanvas(run.ctx, subtitle, canvas.width, canvas.height, currentPlayhead);
    }
    run.mainCtx.drawImage(refs.offscreenCanvasRef.current!, 0, 0);
  }
};

const renderVisibleFrame = async (
  context: MultiTrackPlaybackContext,
  run: MultiTrackPlaybackRun,
  currentPlayhead: number,
  validFrames: DecodedMultiTrackFrame[],
  validVideoFrames: DecodedMultiTrackFrame[],
  activeTextNeedsSubject: boolean,
  activeTextClips: ReturnType<typeof import("./canvas-renderers").getActiveTextClips>,
  activeShapeClips: ReturnType<typeof import("./canvas-renderers").getActiveShapeClips>,
): Promise<void> => {
  const { refs } = context;
  const canvas = refs.canvasRef.current;
  if (!canvas) return;
  context.fillPreviewBackground(
    run.ctx,
    refs.playheadPositionRef.current,
    canvas.width,
    canvas.height,
  );

  const tracks = refs.timelineTracksRef.current;
  const clipToTrackIndex = new Map<string, number>();
  tracks.forEach((track, idx) => {
    if (!track.hidden) {
      for (const clip of track.clips) {
        if (context.mediaClipHasVisual(clip)) clipToTrackIndex.set(clip.id, idx);
      }
    }
  });
  const renderableTracks = getVisibleTrackRenderOrder(tracks);

  if (refs.canvasFillModeRef.current === "blur") {
    for (const { originalIndex } of renderableTracks) {
      const baseFrame = validFrames.find(
        (frame) => clipToTrackIndex.get(frame.clip.id) === originalIndex,
      );
      if (baseFrame && baseFrame.frame.width > 0 && baseFrame.frame.height > 0) {
        drawBlurredBackdrop(
          run.ctx,
          baseFrame.frame,
          baseFrame.frame.width,
          baseFrame.frame.height,
          canvas.width,
          canvas.height,
        );
        break;
      }
    }
  }

  const useGPU =
    refs.rendererRef.current?.type === "webgpu" &&
    !activeTextNeedsSubject &&
    activeTextClips.length === 0 &&
    activeShapeClips.length === 0 &&
    !context.hasActiveMotionInstances(currentPlayhead) &&
    !validFrames.some(({ clip }) => context.clipMasksById.has(clip.id));

  if (useGPU) {
    await renderGpuLayers(context, run, validFrames, renderableTracks, clipToTrackIndex, canvas.width, canvas.height);
  } else {
    await renderTrackLayers(
      context,
      run,
      currentPlayhead,
      validFrames,
      renderableTracks,
      clipToTrackIndex,
      activeTextNeedsSubject,
      activeTextClips,
      activeShapeClips,
      canvas.width,
      canvas.height,
    );
  }

  for (const frame of validVideoFrames) frame.cleanup?.();
  for (const subtitle of getActiveSubtitles(refs.allSubtitlesRef.current, currentPlayhead)) {
    renderSubtitleToCanvas(run.ctx, subtitle, canvas.width, canvas.height, currentPlayhead);
  }
  run.mainCtx.drawImage(refs.offscreenCanvasRef.current!, 0, 0);
  try {
    refs.lastGoodFrameRef.current?.close();
    refs.lastGoodFrameRef.current = await createImageBitmap(refs.offscreenCanvasRef.current!);
  } catch {
    // Snapshot failures are recoverable; keep the already-rendered frame.
  }
};

const renderGpuLayers = async (
  context: MultiTrackPlaybackContext,
  run: MultiTrackPlaybackRun,
  validFrames: DecodedMultiTrackFrame[],
  renderableTracks: ReturnType<typeof getVisibleTrackRenderOrder>,
  clipToTrackIndex: Map<string, number>,
  width: number,
  height: number,
): Promise<void> => {
  const renderer = context.refs.rendererRef.current;
  if (!renderer) return;
  const gpuLayers: GPULayer[] = [];
  const tempBitmaps: ImageBitmap[] = [];
  for (const { originalIndex } of renderableTracks) {
    const trackFrames = validFrames.filter(
      (frame) => clipToTrackIndex.get(frame.clip.id) === originalIndex,
    );
    for (const { transform, frame } of trackFrames) {
      if (frame instanceof ImageBitmap) {
        gpuLayers.push({ bitmap: frame, transform });
      } else {
        const bitmap = await createImageBitmap(frame);
        tempBitmaps.push(bitmap);
        gpuLayers.push({ bitmap, transform });
      }
    }
  }
  if (gpuLayers.length > 0) {
    const gpuResult = await renderAllLayersWithGPU(renderer, gpuLayers, width, height);
    if (gpuResult) {
      run.ctx.drawImage(gpuResult, 0, 0, width, height);
      gpuResult.close();
    } else {
      for (const layer of gpuLayers) {
        drawFrameWithTransform(run.ctx, layer.bitmap, layer.transform, width, height);
      }
    }
  }
  for (const bitmap of tempBitmaps) bitmap.close();
};

const renderTrackLayers = async (
  context: MultiTrackPlaybackContext,
  run: MultiTrackPlaybackRun,
  currentPlayhead: number,
  validFrames: DecodedMultiTrackFrame[],
  renderableTracks: ReturnType<typeof getVisibleTrackRenderOrder>,
  clipToTrackIndex: Map<string, number>,
  activeTextNeedsSubject: boolean,
  activeTextClips: ReturnType<typeof import("./canvas-renderers").getActiveTextClips>,
  activeShapeClips: ReturnType<typeof import("./canvas-renderers").getActiveShapeClips>,
  width: number,
  height: number,
): Promise<void> => {
  const { refs } = context;
  let subjectFrame: ImageBitmap | null = null;
  for (const { track, originalIndex } of renderableTracks) {
    const trackFrames = validFrames.filter(
      (frame) => clipToTrackIndex.get(frame.clip.id) === originalIndex,
    );
    for (const { clip, transform, frame } of trackFrames) {
      await context.drawClipFrame(run.ctx, clip.id, frame, transform, width, height, currentPlayhead);
      if (activeTextNeedsSubject) {
        subjectFrame?.close();
        subjectFrame = await captureSubjectFrame(run.ctx, width, height);
      }
    }
    for (const shapeClip of activeShapeClips.filter((clip) => clip.trackId === track.id)) {
      await renderShapeClipWithEffects(run.ctx, shapeClip, width, height, currentPlayhead);
    }
    await context.renderMotionInstancesForTrack(run.ctx, track, currentPlayhead, width, height);
    for (const textClip of activeTextClips.filter((clip) => clip.trackId === track.id)) {
      await renderTextClipWithSubjectMask(
        run.ctx,
        textClip,
        width,
        height,
        currentPlayhead,
        subjectFrame,
        true,
        getBehindSubjectStreamId(
          refs.timelineTracksRef.current,
          currentPlayhead,
          context.getMediaItem,
        ),
      );
    }
  }
  subjectFrame?.close();
};
