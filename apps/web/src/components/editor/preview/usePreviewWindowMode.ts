import { useCallback, useEffect, useMemo } from "react";
import type { MediaItem, Track } from "@openreel/core";
import { useTimelineStore } from "../../../stores/timeline-store";
import type { PreviewRefs } from "./preview-runtime-types";

interface PreviewWindowModeOptions {
  refs: PreviewRefs;
  setZoomLevel: (level: number) => void;
  setIsFullscreen: (value: boolean) => void;
  setIsMaximized: (update: (previous: boolean) => boolean) => void;
}

export function usePreviewWindowMode({
  refs,
  setZoomLevel,
  setIsFullscreen,
  setIsMaximized,
}: PreviewWindowModeOptions) {
  const handleFullscreen = useCallback(() => {
    const container = refs.containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      setZoomLevel(1);
      container.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((error: unknown) => {
        console.error("Error entering fullscreen:", error);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch((error: unknown) => {
        console.error("Error exiting fullscreen:", error);
      });
    }
  }, []);

  const handleMaximize = useCallback(() => {
    setZoomLevel(1);
    setIsMaximized((previous) => !previous);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return { handleFullscreen, handleMaximize };
}

export function usePreviewCropControls(
  cropClipId: string | null,
  updateClipTransform: (clipId: string, transform: { crop: { x: number; y: number; width: number; height: number } }) => unknown,
  setCropMode: (enabled: boolean) => void,
) {
  const handleCropChange = useCallback((crop: { x: number; y: number; width: number; height: number }) => {
    if (cropClipId) updateClipTransform(cropClipId, { crop });
  }, [cropClipId, updateClipTransform]);
  const handleCropComplete = useCallback(() => setCropMode(false), [setCropMode]);
  const handleCropCancel = useCallback(() => setCropMode(false), [setCropMode]);
  return { handleCropChange, handleCropComplete, handleCropCancel };
}

export function usePreviewSkipControls(
  seekRelative: (seconds: number) => void,
  seekTo: (seconds: number) => void,
  actualEndTime: number,
  projectDuration: number,
) {
  const handleSkipBack = useCallback(() => seekRelative(-5), [seekRelative]);
  const handleSkipForward = useCallback(() => {
    const current = useTimelineStore.getState().playheadPosition;
    const end = actualEndTime > 0 ? actualEndTime : projectDuration;
    seekTo(end > 0 ? Math.min(current + 5, end) : current + 5);
  }, [seekTo, actualEndTime, projectDuration]);
  return { handleSkipBack, handleSkipForward };
}

export function usePreviewCropData(
  cropMode: boolean,
  cropClipId: string | null,
  timelineTracks: Track[],
  getMediaItem: (id: string) => MediaItem | undefined,
) {
  const cropClip = useMemo(() => {
    if (!cropMode || !cropClipId) return null;
    for (const track of timelineTracks) {
      const clip = track.clips.find((candidate) => candidate.id === cropClipId);
      if (clip) return clip;
    }
    return null;
  }, [cropMode, cropClipId, timelineTracks]);

  const cropMediaData = useMemo(() => {
    if (!cropMode || !cropClipId || !cropClip) return null;
    const mediaItem = getMediaItem(cropClip.mediaId);
    if (!mediaItem) return null;
    let src: string | null = null;
    if (mediaItem.blob) src = URL.createObjectURL(mediaItem.blob);
    else if (mediaItem.originalUrl) src = mediaItem.originalUrl;
    if (!src) return null;
    return { src, type: mediaItem.type as "video" | "image" };
  }, [cropMode, cropClipId, cropClip, getMediaItem]);

  return {
    cropClip,
    cropMediaData,
    cropVideoSrc: cropMediaData?.src ?? null,
    cropMediaType: cropMediaData?.type ?? "video",
  };
}
