/** Draws native video frames and overlays onto the preview canvas. */
import {
  getVidstabEngine,
  type MediaItem,
  type Track,
} from "@openreel/core";
import {
  getActiveShapeClips,
  getActiveSubtitles,
  getActiveTextClips,
  getTransitionAtTime,
  renderSubtitleToCanvas,
  renderTransitionCanvas,
} from "./index";
import { captureSubjectFrame, createTransparentCanvasSource, hasBehindSubjectText } from "./preview-subject-mask";
import type { PreviewClip } from "./preview-runtime-types";
import type { NativePlaybackOptions } from "./usePreviewNativePlayback";
import { playVideoElement } from "./preview-native-playback-sync";
import { renderNativeNoClipFrame } from "./preview-native-playback-no-clip";
import { renderNativeVideoClipFrame } from "./preview-native-playback-video-frame";

export interface NativePlaybackFrameState {
  rafId: number | null;
  currentClipId: string | null;
}

export interface NativePlaybackFrameOptions extends Pick<NativePlaybackOptions,
  | "refs"
  | "actualEndTime"
  | "editingFrameDuration"
  | "previewRes"
  | "allSubtitles"
  | "hasActiveMotionInstances"
  | "renderOverlayClipsInTrackOrder"
  | "fillPreviewBackground"
  | "setPlayheadPosition"
  | "mediaClipHasVisual"
> {
  clips: { clip: PreviewClip; mediaItem: MediaItem }[];
  imageClips: { clip: PreviewClip; trackIndex: number }[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  isPlaybackActive: () => boolean;
  masterClock: ReturnType<typeof import("@openreel/core")["getMasterClock"]>;
  videoCache: Map<string, { video: HTMLVideoElement; url: string }>;
  imageBitmapCache: Map<string, ImageBitmap>;
  loadVideoForClip: (clip: PreviewClip, mediaItem: MediaItem) => Promise<void>;
  findClipAtTime: (time: number) => { clip: PreviewClip; mediaItem: MediaItem } | null;
  findNextNativeClip: (clipId: string) => { clip: PreviewClip; mediaItem: MediaItem } | null;
  findNativeClipById: (clipId: string) => { clip: PreviewClip; mediaItem: MediaItem } | null;
  cleanup: () => void;
  onEnd: () => void;
  state: NativePlaybackFrameState;
}

export const createNativePlaybackFrame = (options: NativePlaybackFrameOptions) => {
  const {
    refs,
    actualEndTime,
    editingFrameDuration,
    previewRes,
    allSubtitles,
    isPlaybackActive,
    hasActiveMotionInstances,
    renderOverlayClipsInTrackOrder,
    fillPreviewBackground,
    setPlayheadPosition,
    mediaClipHasVisual,
    clips,
    imageClips,
    canvas,
    ctx,
    masterClock,
    videoCache,
    imageBitmapCache,
    loadVideoForClip,
    findClipAtTime,
    findNextNativeClip,
    findNativeClipById,
    cleanup,
    onEnd,
    state,
  } = options;
  const {
    nativePlaybackActiveRef,
    timelineTracksRef,
    isScrubbingRef,
    startPositionRef,
    lastPlayheadUpdateRef,
    rateRef,
    allShapeClipsRef,
    allTextClipsRef,
    playheadPositionRef,
    canvasFillModeRef,
    lastGoodFrameRef,
  } = refs;
  let drawFrame: () => Promise<void>;
  drawFrame = async () => {
        if (!isPlaybackActive() || !nativePlaybackActiveRef.current) return;

        const currentPlayhead = masterClock.currentTime;

        if (currentPlayhead >= actualEndTime) {
          cleanup();
          setPlayheadPosition(0);
          startPositionRef.current = 0;
          onEnd();
          return;
        }

        if (!masterClock.isPlaying) {
          cleanup();
          if (!isScrubbingRef.current) {
            onEnd();
          }
          return;
        }

        // Publish the clock before any frame decoding/compositing awaits. Audio
        // is scheduled from this same clock, so delaying this update until the
        // end of a heavy render makes sound appear to start ahead of the playhead.
        const nowPlayhead = performance.now();
        if (nowPlayhead - lastPlayheadUpdateRef.current >= editingFrameDuration) {
          lastPlayheadUpdateRef.current = nowPlayhead;
          setPlayheadPosition(currentPlayhead);
        }

        const transitionInfo = getTransitionAtTime(
          currentPlayhead,
          timelineTracksRef.current,
          mediaClipHasVisual,
        );
        if (transitionInfo) {
          const clipARecord = findNativeClipById(transitionInfo.clipA.id);
          const clipBRecord = transitionInfo.clipB
            ? findNativeClipById(transitionInfo.clipB.id)
            : null;

          if (clipARecord && (!transitionInfo.clipB || clipBRecord)) {
            const records = clipBRecord
              ? [clipARecord, clipBRecord]
              : [clipARecord];
            await Promise.all(
              records.map((record) =>
                loadVideoForClip(record.clip, record.mediaItem),
              ),
            );
            if (!isPlaybackActive() || !nativePlaybackActiveRef.current) return;

            const clipACacheId = getVidstabEngine().hasStabilized(
              clipARecord.clip.id,
            )
              ? `stabilized:${clipARecord.clip.id}`
              : clipARecord.clip.mediaId;
            const clipBCacheId = clipBRecord && getVidstabEngine().hasStabilized(
              clipBRecord.clip.id,
            )
              ? `stabilized:${clipBRecord.clip.id}`
              : clipBRecord?.clip.mediaId;
            const clipAVideo = videoCache.get(clipACacheId)?.video;
            const clipBVideo = clipBCacheId
              ? videoCache.get(clipBCacheId)?.video
              : null;

            if (clipAVideo && (!transitionInfo.clipB || clipBVideo)) {
              const sameElement =
                Boolean(clipBVideo) && clipAVideo === clipBVideo;
              const cutTime = clipBRecord?.clip.startTime ?? clipARecord.clip.startTime;
              const outgoingHeld =
                Boolean(clipBVideo) && !sameElement && currentPlayhead >= cutTime;
              const incomingHeld =
                Boolean(clipBVideo) && !sameElement && currentPlayhead < cutTime;

              if (outgoingHeld) clipAVideo.pause();
              if (incomingHeld && clipBVideo) clipBVideo.pause();

              await Promise.all([
                syncVideoToClipTime(
                  clipAVideo,
                  clipARecord.clip,
                  currentPlayhead,
                ),
                clipBVideo && clipBRecord
                  ? syncVideoToClipTime(
                      clipBVideo,
                      clipBRecord.clip,
                      currentPlayhead,
                    )
                  : Promise.resolve(),
              ]);
              if (!isPlaybackActive() || !nativePlaybackActiveRef.current) return;
              if (!outgoingHeld) await playVideoElement(clipAVideo, refs);
              if (!incomingHeld && clipBVideo) {
                await playVideoElement(clipBVideo, refs);
              }

              const blank = transitionInfo.clipB
                ? null
                : createTransparentCanvasSource(canvas.width, canvas.height);
              const outgoingSource =
                transitionInfo.clipB || transitionInfo.edge !== "in"
                  ? clipAVideo
                  : blank;
              const incomingSource = transitionInfo.clipB
                ? clipBVideo
                : transitionInfo.edge === "in"
                  ? clipAVideo
                  : blank;

              const blended =
                outgoingSource && incomingSource
                  ? await renderTransitionCanvas(
                      transitionInfo,
                      outgoingSource,
                      incomingSource,
                    )
                  : null;
              if (!isPlaybackActive() || !nativePlaybackActiveRef.current) return;
              if (blended) {
                fillPreviewBackground(
                  ctx,
                  playheadPositionRef.current,
                  canvas.width,
                  canvas.height,
                );
                ctx.drawImage(blended, 0, 0, canvas.width, canvas.height);
              }

              const activeShapeClipsTr = getActiveShapeClips(
                allShapeClipsRef.current,
                currentPlayhead,
              );
              const activeTextClipsTr = getActiveTextClips(
                allTextClipsRef.current,
                currentPlayhead,
              );
              if (
                activeShapeClipsTr.length > 0 ||
                activeTextClipsTr.length > 0
              ) {
                const transitionSubjectFrame = hasBehindSubjectText(
                  activeTextClipsTr,
                )
                  ? await captureSubjectFrame(ctx, canvas.width, canvas.height)
                  : null;
                try {
                  await renderOverlayClipsInTrackOrder(
                    ctx,
                    timelineTracksRef.current,
                    activeShapeClipsTr,
                    activeTextClipsTr,
                    currentPlayhead,
                    canvas.width,
                    canvas.height,
                    "all",
                    transitionSubjectFrame,
                  );
                } finally {
                  transitionSubjectFrame?.close();
                }
              }

              const activeSubtitlesTr = getActiveSubtitles(
                allSubtitles,
                currentPlayhead,
              );
              for (const subtitle of activeSubtitlesTr) {
                renderSubtitleToCanvas(
                  ctx,
                  subtitle,
                  canvas.width,
                  canvas.height,
                  currentPlayhead,
                );
              }

              const nowTransition = performance.now();
              if (
                nowTransition - lastPlayheadUpdateRef.current >=
                editingFrameDuration
              ) {
                lastPlayheadUpdateRef.current = nowTransition;
                setPlayheadPosition(currentPlayhead);
              }
              state.rafId = requestAnimationFrame(() => {
                drawFrame();
              });
              return;
            }
          }
        }

        const activeClip = findClipAtTime(currentPlayhead);

        if (!activeClip) {
          await renderNativeNoClipFrame({
            refs,
            currentPlayhead,
            canvas,
            ctx,
            imageClips,
            imageBitmapCache,
            allSubtitles,
            state,
            previewScale: previewRes.scale,
            editingFrameDuration,
            fillPreviewBackground,
            hasActiveMotionInstances,
            renderOverlayClipsInTrackOrder,
            setPlayheadPosition,
            drawFrame,
          });
          return;
        }

        await renderNativeVideoClipFrame({ ...options, activeClip, currentPlayhead, drawFrame });
  };
  return drawFrame;
};
