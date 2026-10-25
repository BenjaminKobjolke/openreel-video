/** Synchronizes cached video elements to the shared playback clock. */

import { getSpeedEngine, getVidstabEngine, type Track } from "@openreel/core";
import type { PreviewRefs } from "./preview-runtime-types";

type PreviewClip = Track["clips"][number];

export const waitForDrawableVideoFrame = async (
  video: HTMLVideoElement,
  timeoutMs = 300,
): Promise<void> => {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener("loadeddata", finish);
      video.removeEventListener("canplay", finish);
      resolve();
    };
    video.addEventListener("loadeddata", finish);
    video.addEventListener("canplay", finish);
    timeoutId = setTimeout(finish, timeoutMs);
  });
};

export const syncVideoToClipTime = async (
  video: HTMLVideoElement,
  clip: PreviewClip,
  time: number,
): Promise<void> => {
  const localTime = Math.max(0, Math.min(clip.duration, time - clip.startTime));
  const adjustedLocalTime = getSpeedEngine().getSourceTimeAtPlaybackTime(
    clip.id,
    localTime,
  );
  const sourceTime = Math.max(
    clip.inPoint,
    Math.min(clip.outPoint, clip.inPoint + adjustedLocalTime),
  );
  const videoTime = getVidstabEngine().hasStabilized(clip.id)
    ? sourceTime - clip.inPoint
    : sourceTime;

  let needsDrawableWait = video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
  if (Math.abs(video.currentTime - videoTime) > 0.1) {
    needsDrawableWait = true;
    await new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        video.removeEventListener("seeked", finish);
        resolve();
      };
      video.addEventListener("seeked", finish);
      timeoutId = setTimeout(finish, 250);
      video.currentTime = videoTime;
    });
  } else if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    needsDrawableWait = true;
    video.currentTime = videoTime;
  }

  if (needsDrawableWait) {
    await waitForDrawableVideoFrame(video);
  }
};

export const playVideoElement = async (
  video: HTMLVideoElement,
  refs: PreviewRefs,
): Promise<void> => {
  video.playbackRate = refs.rateRef.current;
  if (!video.paused) {
    return;
  }
  try {
    await video.play();
  } catch {
    // The canvas renderer can still draw if autoplay is blocked.
  }
};
