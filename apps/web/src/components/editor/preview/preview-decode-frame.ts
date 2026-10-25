/** Decodes preview frames and paints the current preview background. */
import { getSpeedEngine, getVidstabEngine, type MediaItem } from "@openreel/core";
import { captureNativeVideoFrame } from "./video-frame";
import type { PreviewRefs } from "./preview-runtime-types";

interface DecodePreviewFrameContext {
  refs: PreviewRefs;
  getMediaItem: (id: string) => MediaItem | undefined;
  failProxyPlayback: (id: string, blob: Blob | null) => void;
  evictOldestVideoElement: () => void;
  releaseVideoElement: (entry: { video: HTMLVideoElement; url: string }) => void;
  scheduleScrubVideoRelease: () => void;
}

export const decodePreviewClipFrame = async (
  { refs, getMediaItem, failProxyPlayback, evictOldestVideoElement, releaseVideoElement, scheduleScrubVideoRelease }: DecodePreviewFrameContext,
  clip: { id: string; mediaId: string; startTime: number; inPoint?: number },
  time: number,
): Promise<ImageBitmap | null> => {
  const {
    decodeRequestSeqRef,
    scrubVideoReleaseTimerRef,
    decodeDebounceRef,
    decodeDebounceResolveRef,
    videoElementCacheRef,
  } = refs;
      const mediaItem = getMediaItem(clip.mediaId);
      if (!mediaItem?.blob) return null;
      const vidstab = getVidstabEngine();
      const mediaBlob = (vidstab.hasStabilized(clip.id)
        ? vidstab.getStabilizedBlob(clip.id)
        : mediaItem.blob)!;

      if (mediaItem.type === "image") {
        try {
          return await createImageBitmap(mediaItem.blob);
        } catch {
          return null;
        }
      }

      const requestSeq = ++decodeRequestSeqRef.current;
      const isStaleRequest = () => requestSeq !== decodeRequestSeqRef.current;

      if (scrubVideoReleaseTimerRef.current) {
        clearTimeout(scrubVideoReleaseTimerRef.current);
        scrubVideoReleaseTimerRef.current = null;
      }

      if (decodeDebounceRef.current) {
        clearTimeout(decodeDebounceRef.current);
        decodeDebounceRef.current = null;
      }
      decodeDebounceResolveRef.current?.(null);
      decodeDebounceResolveRef.current = null;

      return new Promise<ImageBitmap | null>((resolve) => {
        decodeDebounceResolveRef.current = resolve;
        decodeDebounceRef.current = setTimeout(async () => {
          decodeDebounceRef.current = null;
          decodeDebounceResolveRef.current = null;

          if (isStaleRequest()) {
            resolve(null);
            return;
          }

          try {
            const clipLocalTime = time - clip.startTime;
            const speedEngine = getSpeedEngine();
            const adjustedLocalTime = speedEngine.getSourceTimeAtPlaybackTime(
              clip.id,
              clipLocalTime,
            );
            const isStabilized = vidstab.hasStabilized(clip.id);
            const mediaTime = isStabilized ? adjustedLocalTime : (clip.inPoint || 0) + adjustedLocalTime;
            const cacheKey = isStabilized ? `${clip.mediaId}:stabilized` : clip.mediaId;
            let cached = videoElementCacheRef.current.get(cacheKey);

            if (!cached) {
              const url = URL.createObjectURL(mediaBlob);
              const video = document.createElement("video");
              video.src = url;
              video.muted = true;
              video.playsInline = true;
              video.preload = "metadata";
              video.crossOrigin = "anonymous";

              await new Promise<void>((res, rej) => {
                const timeoutId = setTimeout(
                  () => rej(new Error("Video load timeout")),
                  10000,
                );
                video.onloadedmetadata = () => {
                  clearTimeout(timeoutId);
                  res();
                };
                video.onerror = () => {
                  clearTimeout(timeoutId);
                  rej(new Error("Video load failed"));
                };
              });

              if (isStaleRequest()) {
                releaseVideoElement({ video, url });
                resolve(null);
                return;
              }

              cached = { video, url, lastUsed: Date.now() };
              videoElementCacheRef.current.set(cacheKey, cached);

              while (videoElementCacheRef.current.size > 2) {
                evictOldestVideoElement();
              }
            }

            cached.lastUsed = Date.now();
            const { video } = cached;

            const clampedTime = Math.max(
              0,
              Math.min(mediaTime, video.duration - 0.001),
            );
            const seekTime =
              clampedTime <= 0 && video.duration > 0.002 ? 0.001 : clampedTime;
            if (
              Math.abs(video.currentTime - seekTime) > 0.01 ||
              video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
              video.currentTime = seekTime;
              await new Promise<void>((res) => {
                let settled = false;
                let timeoutId: ReturnType<typeof setTimeout> | null = null;
                const onSeeked = () => {
                  if (settled) return;
                  settled = true;
                  if (timeoutId) clearTimeout(timeoutId);
                  video.removeEventListener("seeked", onSeeked);
                  res();
                };
                video.addEventListener("seeked", onSeeked);
                timeoutId = setTimeout(() => {
                  if (settled) return;
                  settled = true;
                  video.removeEventListener("seeked", onSeeked);
                  res();
                }, 250);
              });
            }

            if (isStaleRequest()) {
              resolve(null);
              return;
            }

            await new Promise<void>((res) => {
              if (!("requestVideoFrameCallback" in video)) {
                res();
                return;
              }

              let settled = false;
              let timeoutId: ReturnType<typeof setTimeout> | null = null;
              const finish = () => {
                if (settled) return;
                settled = true;
                if (timeoutId) clearTimeout(timeoutId);
                res();
              };

              video.requestVideoFrameCallback(finish);
              timeoutId = setTimeout(finish, 300);
            });

            if (isStaleRequest()) {
              resolve(null);
              return;
            }

            await new Promise<void>((res) => {
              if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                res();
                return;
              }

              let settled = false;
              let timeoutId: ReturnType<typeof setTimeout> | null = null;
              const finish = () => {
                if (settled) return;
                settled = true;
                if (timeoutId) clearTimeout(timeoutId);
                video.removeEventListener("loadeddata", finish);
                video.removeEventListener("canplay", finish);
                res();
              };

              video.addEventListener("loadeddata", finish);
              video.addEventListener("canplay", finish);
              timeoutId = setTimeout(finish, 250);
            });

            if (isStaleRequest()) {
              resolve(null);
              return;
            }

            const frame = await captureNativeVideoFrame(video);
            if (isStaleRequest()) {
              frame.close();
              resolve(null);
              return;
            }
            scheduleScrubVideoRelease();
            resolve(frame);
          } catch {
            if (!isStaleRequest()) failProxyPlayback(clip.mediaId, mediaBlob);
            const cached = videoElementCacheRef.current.get(clip.mediaId);
            if (cached) {
              releaseVideoElement(cached);
              videoElementCacheRef.current.delete(clip.mediaId);
            }
            scheduleScrubVideoRelease();
            resolve(null);
          }
        }, 50);
      });
};
export const fillPreviewBackground = (
  refs: PreviewRefs,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  _time: number,
  width: number,
  height: number,
): void => {
  const { canvasFillModeRef, canvasFillColorRef, previewBgRef } = refs;
  if (canvasFillModeRef.current === "color" && canvasFillColorRef.current) {
    ctx.fillStyle = canvasFillColorRef.current;
  } else {
    ctx.fillStyle = previewBgRef.current;
  }
  ctx.fillRect(0, 0, width, height);
};