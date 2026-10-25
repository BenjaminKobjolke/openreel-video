/** Keeps shared preview refs synchronized with their React values. */

import { useEffect } from "react";
import type { RefObject } from "react";

export const usePreviewRefMirror = <T>(ref: RefObject<T>, value: T): void => {
  useEffect(() => {
    ref.current = value;
  }, [value]);
};

export const usePreviewBackgroundMirror = (
  ref: RefObject<string>,
  canvasFillMode: "color" | "blur" | undefined,
  canvasFillColor: string | undefined,
  isDark: boolean,
): void => {
  useEffect(() => {
    if (canvasFillMode === "color" && canvasFillColor) {
      ref.current = canvasFillColor;
      return;
    }
    const screenBg =
      typeof window !== "undefined"
        ? getComputedStyle(document.documentElement)
            .getPropertyValue("--screen-bg")
            .trim()
        : "";
    ref.current = screenBg || (isDark ? "#000000" : "#ffffff");
  }, [canvasFillMode, canvasFillColor, isDark]);
};

export const usePreviewStartPositionMirror = (
  ref: RefObject<number>,
  isPlaying: boolean,
  playheadPosition: number,
): void => {
  useEffect(() => {
    if (!isPlaying) {
      ref.current = playheadPosition;
    }
  }, [isPlaying, playheadPosition]);
};
