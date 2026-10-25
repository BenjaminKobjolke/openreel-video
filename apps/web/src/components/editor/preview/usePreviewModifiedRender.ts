import { useEffect } from "react";
import type { Project } from "@openreel/core";
import type { PreviewRefs } from "./preview-runtime-types";

interface PreviewModifiedRenderOptions {
  refs: PreviewRefs;
  playheadPosition: number;
  isPlaying: boolean;
  isScrubbing: boolean;
  renderFrameDirectly: (time: number) => Promise<boolean>;
  renderFallbackFrame: (time: number) => Promise<void>;
  releaseScrubVideoElements: () => void;
  project: Project;
  proxySourceRevision: number;
  isDark: boolean;
}

export function usePreviewModifiedRender({
  refs,
  playheadPosition,
  isPlaying,
  isScrubbing,
  renderFrameDirectly,
  renderFallbackFrame,
  releaseScrubVideoElements,
  project,
  proxySourceRevision,
  isDark,
}: PreviewModifiedRenderOptions): void {
  const {
    canvasRef,
    isInteractingRef,
    lastProjectForRenderRef,
    lastProxyRevisionForRenderRef,
    lastPlayheadForRenderRef,
    lastPreviewRenderTimeRef,
    renderInFlightRef,
    pendingRenderTimeRef,
    modifiedRenderTimerRef,
  } = refs;

  useEffect(() => {
    if (isPlaying) return;

    if (isInteractingRef.current) {
      lastProjectForRenderRef.current = project;
      return;
    }

    if (!canvasRef.current) return;

    const playheadChanged = playheadPosition !== lastPlayheadForRenderRef.current;
    const projectChanged = project !== lastProjectForRenderRef.current;
    const sourceChanged = proxySourceRevision !== lastProxyRevisionForRenderRef.current;

    lastProjectForRenderRef.current = project;
    lastProxyRevisionForRenderRef.current = proxySourceRevision;
    lastPlayheadForRenderRef.current = playheadPosition;

    const previousRenderTime = lastPreviewRenderTimeRef.current;
    const isLargeJump =
      Math.abs(playheadPosition - previousRenderTime) > 1 ||
      playheadPosition < previousRenderTime - 0.25;
    if (isLargeJump) releaseScrubVideoElements();
    lastPreviewRenderTimeRef.current = playheadPosition;

    const doRender = async (time: number) => {
      if (renderInFlightRef.current) {
        // Coalesce scrub requests while a slower frame is being rendered.
        pendingRenderTimeRef.current = time;
        return;
      }
      renderInFlightRef.current = true;
      try {
        const rendered = await renderFrameDirectly(time);
        if (!rendered) await renderFallbackFrame(time);
      } finally {
        renderInFlightRef.current = false;
        const next = pendingRenderTimeRef.current;
        if (next !== null) {
          pendingRenderTimeRef.current = null;
          doRender(next);
        } else {
          pendingRenderTimeRef.current = null;
        }
      }
    };

    if (playheadChanged || sourceChanged) {
      doRender(playheadPosition);
    } else if (projectChanged) {
      if (modifiedRenderTimerRef.current) clearTimeout(modifiedRenderTimerRef.current);
      modifiedRenderTimerRef.current = setTimeout(() => {
        modifiedRenderTimerRef.current = null;
        doRender(playheadPosition);
      }, 150);
    }

    return () => {
      if (modifiedRenderTimerRef.current) {
        clearTimeout(modifiedRenderTimerRef.current);
        modifiedRenderTimerRef.current = null;
      }
    };
  }, [
    playheadPosition,
    isPlaying,
    isScrubbing,
    renderFrameDirectly,
    renderFallbackFrame,
    releaseScrubVideoElements,
    project,
    proxySourceRevision,
    isDark,
  ]);
}
