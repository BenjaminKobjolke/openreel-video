/** Creates and releases the media resources used by multitrack playback. */

import type { MediaItem, Track } from "@openreel/core";
import type { PreviewRefs } from "./preview-runtime-types";

type PreviewClip = Track["clips"][number];
type PlaybackResource = {
  input: { [Symbol.dispose]?: () => void };
  sink: unknown;
  mediaId: string;
  clipId: string;
  trackIndex: number;
};

interface PlaybackResourceOptions {
  getMediaItem: (id: string) => MediaItem | undefined;
  failProxyPlayback: (mediaId: string, blob: Blob) => void;
}

export const initClipResources = async (
  clip: PreviewClip,
  trackIndex: number,
  isActive: () => boolean,
  { getMediaItem, failProxyPlayback }: PlaybackResourceOptions,
): Promise<PlaybackResource | null> => {
  const mediaItem = getMediaItem(clip.mediaId);
  if (!mediaItem?.blob) {
    return null;
  }

  // Images are rendered directly via createImageBitmap and need no decoder.
  if (mediaItem.type === "image") {
    return null;
  }

  try {
    const mediabunny = await import("mediabunny");
    const { Input, ALL_FORMATS, BlobSource, CanvasSink } = mediabunny;
    const input = new Input({
      source: new BlobSource(mediaItem.blob),
      formats: ALL_FORMATS,
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack || !isActive()) {
      input[Symbol.dispose]?.();
      return null;
    }

    const canDecode = await videoTrack.canDecode();
    if (!canDecode || !isActive()) {
      input[Symbol.dispose]?.();
      if (isActive()) failProxyPlayback(clip.mediaId, mediaItem.blob);
      return null;
    }

    const sink = new CanvasSink(videoTrack, { poolSize: 3 });
    return {
      input,
      sink,
      mediaId: clip.mediaId,
      clipId: clip.id,
      trackIndex,
    };
  } catch (error) {
    if (isActive()) failProxyPlayback(clip.mediaId, mediaItem.blob);
    console.error(
      `[Preview] Failed to init resources for clip ${clip.id}:`,
      error,
    );
    return null;
  }
};

export const preCacheAllImageBitmaps = async (
  refs: PreviewRefs,
  tracks: readonly Track[],
  getMediaItem: (id: string) => MediaItem | undefined,
): Promise<void> => {
  const visualTracks = tracks.filter((track) => !track.hidden);

  for (const track of visualTracks) {
    for (const clip of track.clips) {
      if (refs.imageBitmapCacheRef.current.has(clip.id)) continue;

      const mediaItem = getMediaItem(clip.mediaId);
      if (mediaItem?.type === "image" && mediaItem.blob) {
        try {
          const bitmap = await createImageBitmap(mediaItem.blob);
          refs.imageBitmapCacheRef.current.set(clip.id, bitmap);
        } catch (error) {
          console.warn(
            `[Preview] Failed to pre-cache image clip ${clip.id}:`,
            error,
          );
        }
      }
    }
  }
};
