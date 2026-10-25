/** Keeps multitrack frames paced without losing the active playback callback. */
import type { MultiTrackPlaybackContext } from "./preview-runtime-types";

export const scheduleMultiTrackFrame = (
  context: MultiTrackPlaybackContext,
  processFrame: () => void,
  delay: number,
): void => {
  if (!context.isActive()) return;
  if (delay > 0) {
    setTimeout(() => {
      if (context.isActive()) {
        context.refs.animationRef.current = requestAnimationFrame(processFrame);
      }
    }, delay);
  } else {
    context.refs.animationRef.current = requestAnimationFrame(processFrame);
  }
};
