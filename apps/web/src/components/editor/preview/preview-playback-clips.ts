/** Timeline clip lookup used by the editor's playback loop. */

import type { Track } from "@openreel/core";
import type { PreviewClip } from "./preview-runtime-types";

export interface PlaybackClipAtTime {
  clip: PreviewClip;
  track: Track;
  trackIndex: number;
}

export const findAllClipsAtTime = (
  tracks: readonly Track[],
  time: number,
  mediaClipHasVisual: (clip: PreviewClip) => boolean,
): PlaybackClipAtTime[] => {
  const results: PlaybackClipAtTime[] = [];

  tracks.forEach((track, originalIndex) => {
    if (!track.hidden) {
      for (const clip of track.clips) {
        if (
          mediaClipHasVisual(clip) &&
          time >= clip.startTime &&
          time < clip.startTime + clip.duration
        ) {
          results.push({ clip, track, trackIndex: originalIndex });
        }
      }
    }
  });

  return results.sort((a, b) => a.trackIndex - b.trackIndex);
};

export const findClipAtTime = (
  tracks: readonly Track[],
  time: number,
  mediaClipHasVisual: (clip: PreviewClip) => boolean,
): PlaybackClipAtTime | null =>
  findAllClipsAtTime(tracks, time, mediaClipHasVisual)[0] ?? null;

export const findNextClipStartTime = (
  tracks: readonly Track[],
  afterTime: number,
  mediaClipHasVisual: (clip: PreviewClip) => boolean,
): number | null => {
  const videoTracks = tracks.filter((track) => !track.hidden);
  let nextStart: number | null = null;

  for (const track of videoTracks) {
    for (const clip of track.clips) {
      if (mediaClipHasVisual(clip) && clip.startTime > afterTime) {
        if (nextStart === null || clip.startTime < nextStart) {
          nextStart = clip.startTime;
        }
      }
    }
  }

  return nextStart;
};
