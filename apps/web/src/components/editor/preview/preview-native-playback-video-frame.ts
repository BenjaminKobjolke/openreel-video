/** Draws an active native video clip and its overlays. */
import {
  getBackgroundRemovalEngine,
  getSpeedEngine,
  getVidstabEngine,
} from "@openreel/core";
import {
  applyEffectsToFrame,
  applyEmphasisAnimation,
  drawFrameWithTransform,
  getActiveShapeClips,
  getActiveSubtitles,
  getActiveTextClips,
  getAnimatedTransform,
  renderSubtitleToCanvas,
  DEFAULT_TRANSFORM,
} from "./index";
import type { ClipTransform } from "./types";
import { applyStabilizationTransform, scaleTransformPositionForPreview } from "./preview-frame-prep";
import { drawBlurredBackdrop } from "./preview-aspect";
import { clipCssFilterOnly } from "./preview-adjustment-layers";
import { captureSubjectFrame, hasBehindSubjectText } from "./preview-subject-mask";
import { syncVideoToClipTime, playVideoElement } from "./preview-native-playback-sync";
import type { NativePlaybackFrameOptions } from "./preview-native-playback-frame";
import type { PreviewClip } from "./preview-runtime-types";
import type { MediaItem } from "@openreel/core";

interface ActiveClipFrameOptions extends NativePlaybackFrameOptions {
  activeClip: { clip: PreviewClip; mediaItem: MediaItem };
  currentPlayhead: number;
  drawFrame: () => Promise<void>;
}

export const renderNativeVideoClipFrame = async (options: ActiveClipFrameOptions): Promise<void> => {
  const {
    refs,
    previewRes,
    editingFrameDuration,
    allSubtitles,
    hasActiveMotionInstances,
    renderOverlayClipsInTrackOrder,
    fillPreviewBackground,
    setPlayheadPosition,
    activeClip,
    currentPlayhead,
    drawFrame,
    imageClips,
    canvas,
    ctx,
    videoCache,
    imageBitmapCache,
    loadVideoForClip,
    findNextNativeClip,
    isPlaybackActive,
    state,
  } = options;
  const {
    nativePlaybackActiveRef,
    timelineTracksRef,
    lastPlayheadUpdateRef,
    allShapeClipsRef,
    allTextClipsRef,
    playheadPositionRef,
    canvasFillModeRef,
    lastGoodFrameRef,
  } = refs;  const { clip, mediaItem } = activeClip;
        const vidstabPlay = getVidstabEngine();
        const clipIsStabilized = vidstabPlay.hasStabilized(clip.id);
        const playbackCacheId = clipIsStabilized ? `stabilized:${clip.id}` : clip.mediaId;
        const cached = videoCache.get(playbackCacheId);

        if (!cached) {
          await loadVideoForClip(clip, mediaItem);
          if (!isPlaybackActive() || !nativePlaybackActiveRef.current) return;
          const nowNoCached = performance.now();
          if (nowNoCached - lastPlayheadUpdateRef.current >= editingFrameDuration) {
            lastPlayheadUpdateRef.current = nowNoCached;
            setPlayheadPosition(currentPlayhead);
          }
          state.rafId = requestAnimationFrame(() => { drawFrame(); });
          return;
        }

        const { video } = cached;

        if (state.currentClipId !== clip.id) {
          state.currentClipId = clip.id;
        }

        const latestClip = (() => {
          for (const track of timelineTracksRef.current) {
            const found = track.clips.find((c) => c.id === clip.id);
            if (found) return found;
          }
          return clip;
        })();

        const clipLocalTime = currentPlayhead - latestClip.startTime;
        const speedEngine = getSpeedEngine();
        const adjustedLocalTime = speedEngine.getSourceTimeAtPlaybackTime(
          latestClip.id,
          clipLocalTime,
        );
        const sourceTime = Math.max(
          latestClip.inPoint,
          Math.min(latestClip.outPoint, latestClip.inPoint + adjustedLocalTime),
        );
        await syncVideoToClipTime(video, latestClip, currentPlayhead);
        if (!isPlaybackActive() || !nativePlaybackActiveRef.current) return;
        await playVideoElement(video, refs);

        const timeUntilClipEnd =
          latestClip.startTime + latestClip.duration - currentPlayhead;
        if (timeUntilClipEnd <= 1.0) {
          const nextClip = findNextNativeClip(latestClip.id);
          if (nextClip) {
            loadVideoForClip(nextClip.clip, nextClip.mediaItem).catch(() => {});
          }
        }

        let transform = scaleTransformPositionForPreview(
          getAnimatedTransform(
            (latestClip.transform as ClipTransform) || DEFAULT_TRANSFORM,
            latestClip.keyframes,
            clipLocalTime,
          ),
          previewRes.scale,
        );

        if (latestClip.emphasisAnimation && latestClip.emphasisAnimation.type !== "none") {
          const emphasisState = applyEmphasisAnimation(
            latestClip.emphasisAnimation,
            clipLocalTime,
          );
          transform = {
            ...transform,
            opacity: transform.opacity * emphasisState.opacity,
            scale: {
              x: transform.scale.x * emphasisState.scale * emphasisState.scaleX,
              y: transform.scale.y * emphasisState.scale * emphasisState.scaleY,
            },
            position: {
              x: transform.position.x + emphasisState.offsetX * canvas.width,
              y: transform.position.y + emphasisState.offsetY * canvas.height,
            },
            rotation: transform.rotation + emphasisState.rotation,
          };
        }

        fillPreviewBackground(
          ctx,
          playheadPositionRef.current,
          canvas.width,
          canvas.height,
        );

        if (
          canvasFillModeRef.current === "blur" &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          drawBlurredBackdrop(
            ctx,
            video,
            video.videoWidth,
            video.videoHeight,
            canvas.width,
            canvas.height,
          );
        }

        // Sort by track index descending (higher index = background = render first)
        const sortedImageClips = [...imageClips].sort(
          (a, b) => b.trackIndex - a.trackIndex,
        );
        for (const { clip: imgClip } of sortedImageClips) {
          if (
            currentPlayhead >= imgClip.startTime &&
            currentPlayhead < imgClip.startTime + imgClip.duration
          ) {
            const bitmap = imageBitmapCache.get(imgClip.id);
            if (bitmap) {
              const latestImgClip = (() => {
                for (const track of timelineTracksRef.current) {
                  const found = track.clips.find((c) => c.id === imgClip.id);
                  if (found) return found;
                }
                return imgClip;
              })();
              const imgClipLocalTime = currentPlayhead - imgClip.startTime;
              const imgTransform = scaleTransformPositionForPreview(
                getAnimatedTransform(
                  (latestImgClip.transform as ClipTransform) ||
                    DEFAULT_TRANSFORM,
                  latestImgClip.keyframes,
                  imgClipLocalTime,
                ),
                previewRes.scale,
              );
              drawFrameWithTransform(
                ctx,
                bitmap,
                imgTransform,
                canvas.width,
                canvas.height,
              );
            }
          }
        }

        const allShapeClipsData = allShapeClipsRef.current;
        const activeShapeClips = getActiveShapeClips(
          allShapeClipsData,
          currentPlayhead,
        );
        const activeTextClips = getActiveTextClips(
          allTextClipsRef.current,
          currentPlayhead,
        );

        const bgEngine = getBackgroundRemovalEngine();
        const hasBgRemoval = bgEngine?.isInitialized() && bgEngine.getSettings(clip.id).enabled;

        let videoFrame: HTMLVideoElement | ImageBitmap = video;
        if (hasBgRemoval) {
          try {
            const rawBitmap = await createImageBitmap(video);
            const processed = await applyEffectsToFrame(clip.id, rawBitmap);
            if (!isPlaybackActive() || !nativePlaybackActiveRef.current) {
              if (processed !== rawBitmap) {
                processed.close();
              }
              rawBitmap.close();
              return;
            }
            if (processed !== rawBitmap) {
              rawBitmap.close();
            }
            videoFrame = processed;
          } catch {
            videoFrame = video;
          }
        }

        let finalTransform = transform;
        const vidstabEng = getVidstabEngine();
        if (
          latestClip.stabilization?.enabled &&
          latestClip.stabilization.analyzed &&
          !vidstabEng.hasStabilized(latestClip.id)
        ) {
          finalTransform = applyStabilizationTransform(
            latestClip,
            transform,
            sourceTime,
            canvas.width,
            canvas.height,
            video.videoWidth,
            video.videoHeight,
          );
        }

        const nativeCssFilter =
          videoFrame === video ? clipCssFilterOnly(clip.id) : null;
        drawFrameWithTransform(
          ctx,
          videoFrame,
          finalTransform,
          canvas.width,
          canvas.height,
          nativeCssFilter ?? undefined,
        );
        if (videoFrame !== video && videoFrame instanceof ImageBitmap) {
          videoFrame.close();
        }
        const subjectFrame = hasBehindSubjectText(activeTextClips)
          ? await captureSubjectFrame(ctx, canvas.width, canvas.height)
          : null;

        // Use CPU canvas2D for all overlays - more reliable than GPU compositing
        // Render all text/graphics overlays (they're above the video since backgrounds are separate)
        if (
          activeShapeClips.length > 0 ||
          activeTextClips.length > 0 ||
          hasActiveMotionInstances(currentPlayhead)
        ) {
          await renderOverlayClipsInTrackOrder(
            ctx,
            timelineTracksRef.current,
            activeShapeClips,
            activeTextClips,
            currentPlayhead,
            canvas.width,
            canvas.height,
            "all",
            subjectFrame,
          );
        }
        subjectFrame?.close();

        const activeSubtitles = getActiveSubtitles(
          allSubtitles,
          currentPlayhead,
        );
        for (const subtitle of activeSubtitles) {
          renderSubtitleToCanvas(
            ctx,
            subtitle,
            canvas.width,
            canvas.height,
            currentPlayhead,
          );
        }

        try {
          lastGoodFrameRef.current?.close();
          lastGoodFrameRef.current = await createImageBitmap(canvas);
        } catch {
          // Snapshot failures are recoverable; keep the already-rendered frame.
        }

        state.rafId = requestAnimationFrame(() => {
          drawFrame();
        });

};
