/** Owns random-access video decoding cache cleanup for the preview. */
import { useCallback, useEffect } from "react";
import type { PreviewRefs } from "./preview-runtime-types";

interface PreviewVideoCacheOptions {
  refs: PreviewRefs;
  proxySourceRevision: number;
}

export const usePreviewVideoCache = ({
  refs,
  proxySourceRevision,
}: PreviewVideoCacheOptions) => {
  const releaseVideoElement = useCallback(
    (entry: { video: HTMLVideoElement; url: string }): void => {
      const { video, url } = entry;
      video.pause();
      video.removeAttribute("src");
      video.onloadedmetadata = null;
      video.onerror = null;
      video.load();
      URL.revokeObjectURL(url);
    },
    [],
  );

  const evictOldestVideoElement = useCallback((): void => {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, entry] of refs.videoElementCacheRef.current.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (!oldestKey) return;

    const oldEntry = refs.videoElementCacheRef.current.get(oldestKey);
    if (!oldEntry) return;

    releaseVideoElement(oldEntry);
    refs.videoElementCacheRef.current.delete(oldestKey);
  }, [refs.videoElementCacheRef, releaseVideoElement]);

  const cancelPendingScrubDecode = useCallback((): void => {
    if (refs.decodeDebounceRef.current) {
      clearTimeout(refs.decodeDebounceRef.current);
      refs.decodeDebounceRef.current = null;
    }
    refs.decodeDebounceResolveRef.current?.(null);
    refs.decodeDebounceResolveRef.current = null;
    refs.decodeRequestSeqRef.current += 1;
  }, [refs.decodeDebounceRef, refs.decodeDebounceResolveRef, refs.decodeRequestSeqRef]);

  const releaseScrubVideoElements = useCallback((): void => {
    if (refs.scrubVideoReleaseTimerRef.current) {
      clearTimeout(refs.scrubVideoReleaseTimerRef.current);
      refs.scrubVideoReleaseTimerRef.current = null;
    }
    cancelPendingScrubDecode();
    for (const entry of refs.videoElementCacheRef.current.values()) {
      releaseVideoElement(entry);
    }
    refs.videoElementCacheRef.current.clear();
  }, [
    refs.scrubVideoReleaseTimerRef,
    refs.videoElementCacheRef,
    cancelPendingScrubDecode,
    releaseVideoElement,
  ]);

  const scheduleScrubVideoRelease = useCallback((): void => {
    if (refs.scrubVideoReleaseTimerRef.current) {
      clearTimeout(refs.scrubVideoReleaseTimerRef.current);
    }
    refs.scrubVideoReleaseTimerRef.current = setTimeout(() => {
      releaseScrubVideoElements();
    }, 350);
  }, [refs.scrubVideoReleaseTimerRef, releaseScrubVideoElements]);

  useEffect(() => {
    releaseScrubVideoElements();
    for (const entry of refs.decoderCacheRef.current.values()) {
      entry.input[Symbol.dispose]?.();
    }
    refs.decoderCacheRef.current.clear();
    for (const entry of refs.nativeVideoCacheRef.current.values()) {
      releaseVideoElement(entry);
    }
    refs.nativeVideoCacheRef.current.clear();
  }, [proxySourceRevision, releaseScrubVideoElements, releaseVideoElement]);

  return {
    cancelPendingScrubDecode,
    evictOldestVideoElement,
    releaseScrubVideoElements,
    releaseVideoElement,
    scheduleScrubVideoRelease,
  };
};
