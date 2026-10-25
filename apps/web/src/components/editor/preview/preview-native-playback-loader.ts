/** Loads and caches video elements used by native preview playback. */

import { getVidstabEngine, type MediaItem, type Track } from "@openreel/core";
import type { PreviewRefs } from "./preview-runtime-types";

type PreviewClip = Track["clips"][number];

interface NativePlaybackLoaderOptions {
  refs: PreviewRefs;
  isCurrentPlayback: () => boolean;
  getMediaItem: (id: string) => MediaItem | undefined;
  failProxyPlayback: (mediaId: string, blob: Blob) => void;
}

export const createNativeVideoLoader = ({
  refs,
  isCurrentPlayback,
  getMediaItem,
  failProxyPlayback,
}: NativePlaybackLoaderOptions) => {
  const videoCache = refs.nativeVideoCacheRef.current;
  const loadingVideos = new Map<string, Promise<void>>();

  const loadVideoForClip = (
    clip: PreviewClip,
    mediaItem: MediaItem,
  ): Promise<void> => {
    if (!isCurrentPlayback()) return Promise.resolve();
    const clipStabilized = getVidstabEngine().hasStabilized(clip.id);
    const videoCacheId = clipStabilized
      ? `stabilized:${clip.id}`
      : clip.mediaId;

    const existingLoad = loadingVideos.get(videoCacheId);
    if (existingLoad) {
      return existingLoad;
    }

    const cachedVideo = videoCache.get(videoCacheId)?.video;
    if (cachedVideo && cachedVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve();
    }

    if (!mediaItem.blob) {
      return Promise.resolve();
    }

    const vidstabEngine = getVidstabEngine();
    const isStabilized = vidstabEngine.hasStabilized(clip.id);
    const playBlob = (isStabilized
      ? vidstabEngine.getStabilizedBlob(clip.id)
      : mediaItem.blob)!;
    const cacheId = isStabilized ? `stabilized:${clip.id}` : clip.mediaId;
    const url = URL.createObjectURL(playBlob);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    videoCache.set(cacheId, { video, url });

    const loadPromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.oncanplay = null;
        video.onerror = null;
        loadingVideos.delete(cacheId);
        resolve();
      };
      video.onloadeddata = finish;
      video.oncanplay = finish;
      video.onloadedmetadata = () => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          finish();
        }
      };
      video.onerror = () => {
        if (isCurrentPlayback() && !isStabilized) {
          failProxyPlayback(clip.mediaId, playBlob);
        }
        finish();
      };
      video.load();
      setTimeout(finish, 1200);
    });

    loadingVideos.set(cacheId, loadPromise);
    return loadPromise;
  };

  return { loadVideoForClip, videoCache };
};
