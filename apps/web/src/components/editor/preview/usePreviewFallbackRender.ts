/** Provides the lightweight canvas fallback and its native-playback eligibility check. */
import { useCallback } from "react";
import {
  getPreviewAudioEffects,
  getSpeedEngine,
  getVisibleTrackRenderOrder,
  type MediaItem,
  type Project,
} from "@openreel/core";
import {
  clipCssFilterOnly,
  clipNeedsFrameProcessing,
} from "./preview-adjustment-layers";
import {
  getActiveShapeClips,
  getActiveSubtitles,
  getActiveTextClips,
  renderSubtitleToCanvas,
} from "./canvas-renderers";
import { getBehindSubjectStreamId } from "./preview-subject-mask";
import {
  renderShapeClipWithEffects,
  renderTextClipWithSubjectMask,
} from "./preview-layer-effects";
import type { PreviewRefs, ClipWithPlaceholder } from "./preview-runtime-types";
import { formatTime } from "./utils";
import type { usePreviewAudio } from "./usePreviewAudio";
import type { usePreviewMedia } from "./usePreviewMedia";
import type { usePreviewMotion } from "./usePreviewMotion";

type PreviewTimeline = Project["timeline"]["tracks"];
type PreviewTrack = PreviewTimeline[number];
type PreviewTimelineClip = PreviewTrack["clips"][number];

interface PreviewFallbackRenderOptions {
  refs: PreviewRefs;
  timelineTracks: PreviewTimeline;
  previewRes: { width: number; height: number };
  allTextClips: ReturnType<typeof usePreviewMedia>["allTextClips"];
  allShapeClips: ReturnType<typeof usePreviewMedia>["allShapeClips"];
  allSubtitles: ReturnType<typeof usePreviewMedia>["allSubtitles"];
  clipMasksById: ReturnType<typeof usePreviewMedia>["clipMasksById"];
  getMediaItem: (id: string) => MediaItem | undefined;
  getResolvedClipAudioEffects: ReturnType<typeof usePreviewAudio>["getResolvedClipAudioEffects"];
  hasActiveMotionInstances: ReturnType<typeof usePreviewMotion>["hasActiveMotionInstances"];
  mediaClipHasAudio: ReturnType<typeof usePreviewMedia>["mediaClipHasAudio"];
  mediaClipHasVisual: ReturnType<typeof usePreviewMedia>["mediaClipHasVisual"];
  isDark: boolean;
  isPlaying: boolean;
}

export const usePreviewFallbackRender = ({
  refs,
  timelineTracks,
  previewRes,
  allTextClips,
  allShapeClips,
  allSubtitles,
  clipMasksById,
  getMediaItem,
  getResolvedClipAudioEffects,
  hasActiveMotionInstances,
  mediaClipHasAudio,
  mediaClipHasVisual,
  isDark,
  isPlaying,
}: PreviewFallbackRenderOptions) => {
  const { canvasRef } = refs;

  const renderFallbackFrame = useCallback(
    async (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = previewRes.width;
        canvas.height = previewRes.height;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const emptyBg = isDark ? "#0f0f11" : "#ffffff";
      const emptyText = isDark ? "#52525b" : "#a1a1aa";
      const textPrimary = isDark ? "#ffffff" : "#18181b";
      const textSecondary = isDark ? "#a1a1aa" : "#71717a";

      const activeShapeClips = getActiveShapeClips(allShapeClips, time);
      const activeTextClips = getActiveTextClips(allTextClips, time);

      const videoTracks = timelineTracks.filter(
        (track) =>
          !track.hidden && track.clips.some((clip) => mediaClipHasVisual(clip)),
      );

      const hasVideoContent = videoTracks.some((track) =>
        track.clips.some(
          (clip) =>
            mediaClipHasVisual(clip) &&
            time >= clip.startTime &&
            time < clip.startTime + clip.duration,
        ),
      );

      ctx.fillStyle = hasVideoContent
        ? isDark
          ? "#18181b"
          : "#f4f4f5"
        : emptyBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let hasRenderedContent = false;

      const allRenderableTracks = getVisibleTrackRenderOrder(timelineTracks);

      for (const { track } of allRenderableTracks) {
        {
          for (const clip of track.clips) {
            if (!mediaClipHasVisual(clip)) continue;
            const clipStart = clip.startTime;
            const clipEnd = clip.startTime + clip.duration;

            if (time >= clipStart && time < clipEnd) {
              const mediaItem = getMediaItem(clip.mediaId);
              if (mediaItem) {
                hasRenderedContent = true;
                ctx.fillStyle = textPrimary;
                ctx.font = "bold 24px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(
                  mediaItem.name,
                  canvas.width / 2,
                  canvas.height / 2,
                );
                ctx.font = "16px Inter, sans-serif";
                ctx.fillStyle = textSecondary;
                ctx.fillText(
                  `${formatTime(time)} / ${formatTime(clip.duration)}`,
                  canvas.width / 2,
                  canvas.height / 2 + 30,
                );
              } else if ((clip as ClipWithPlaceholder).isPlaceholder) {
                hasRenderedContent = true;
                ctx.fillStyle = textSecondary;
                ctx.font = "bold 20px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(
                  "Drop media here",
                  canvas.width / 2,
                  canvas.height / 2,
                );
                ctx.font = "14px Inter, sans-serif";
                ctx.fillStyle = emptyText;
                ctx.fillText(
                  "Replace this placeholder with your content",
                  canvas.width / 2,
                  canvas.height / 2 + 28,
                );
              }
            }
          }
        }
        const trackShapeClips = activeShapeClips.filter(
          (clip) => clip.trackId === track.id,
        );
        for (const shapeClip of trackShapeClips) {
          await renderShapeClipWithEffects(
            ctx,
            shapeClip,
            canvas.width,
            canvas.height,
            time,
          );
          hasRenderedContent = true;
        }
        const trackTextClips = activeTextClips.filter(
          (clip) => clip.trackId === track.id,
        );
        for (const textClip of trackTextClips) {
          await renderTextClipWithSubjectMask(
            ctx,
            textClip,
            canvas.width,
            canvas.height,
            time,
            null,
            isPlaying,
            getBehindSubjectStreamId(timelineTracks, time, getMediaItem),
          );
          hasRenderedContent = true;
        }
      }

      const activeSubtitles = getActiveSubtitles(allSubtitles, time);
      for (const subtitle of activeSubtitles) {
        renderSubtitleToCanvas(
          ctx,
          subtitle,
          canvas.width,
          canvas.height,
          time,
        );
      }

      const audioTracks = timelineTracks.filter((track) => !track.hidden);
      const hasActiveAudioClip = audioTracks.some((track) =>
        track.clips.some(
          (clip) =>
            mediaClipHasAudio(clip) &&
            time >= clip.startTime &&
            time < clip.startTime + clip.duration,
        ),
      );

      if (
        !hasRenderedContent &&
        activeTextClips.length === 0 &&
        activeShapeClips.length === 0 &&
        !hasActiveMotionInstances(time) &&
        !hasActiveAudioClip
      ) {
        ctx.fillStyle = emptyText;
        ctx.font = "24px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          "Import media to get started",
          canvas.width / 2,
          canvas.height / 2,
        );
      }
    },
    [
      timelineTracks,
      getMediaItem,
      previewRes.width,
      previewRes.height,
      allTextClips,
      allShapeClips,
      allSubtitles,
      hasActiveMotionInstances,
      isDark,
      isPlaying,
      mediaClipHasAudio,
      mediaClipHasVisual,
    ],
  );

  // Check if we can use native video element playback (much faster, hardware-accelerated)
  const canUseNativeVideoPlayback = useCallback(
    (
      startPosition: number,
    ): {
      canUse: boolean;
      clips: Array<{
        clip: PreviewTimelineClip;
        mediaItem: NonNullable<ReturnType<typeof getMediaItem>>;
      }>;
      imageClips?: Array<{
        clip: PreviewTimelineClip;
        trackIndex: number;
      }>;
    } => {
      const tracks = timelineTracks;
      if (
        tracks.some(
          (track) =>
            !track.hidden &&
            track.clips.some(
              (clip) =>
                clip.startTime + clip.duration > startPosition &&
                typeof clip.metadata?.compoundClipId === "string",
            ),
        )
      ) {
        return { canUse: false, clips: [] };
      }
      const videoTracks = tracks.filter((track) => !track.hidden);

      const allVideoClips: Array<{
        clip: PreviewTimelineClip;
        mediaItem: NonNullable<ReturnType<typeof getMediaItem>>;
      }> = [];
      const speedEngine = getSpeedEngine();

      for (const track of videoTracks) {
        for (const clip of track.clips) {
          if (clip.startTime + clip.duration > startPosition) {
            if (clipMasksById.has(clip.id)) {
              return { canUse: false, clips: [] };
            }
            const mediaItem = getMediaItem(clip.mediaId);
            if (mediaItem?.blob && mediaItem.type === "video") {
              const clipSpeed = speedEngine.getClipSpeed(clip.id);
              const isReverse = speedEngine.isReverse(clip.id);
              if (
                clipSpeed !== 1 ||
                isReverse ||
                (clipNeedsFrameProcessing(clip.id) &&
                  clipCssFilterOnly(clip.id) === null)
              ) {
                return { canUse: false, clips: [] };
              }
              allVideoClips.push({ clip, mediaItem });
            }
          }
        }
      }

      const hasActiveAudioEffects = tracks.some(
        (track) =>
          !track.hidden &&
          track.clips.some((clip) => {
            if (clip.startTime + clip.duration <= startPosition) {
              return false;
            }
            if (!mediaClipHasAudio(clip)) return false;

            return getPreviewAudioEffects(
              getResolvedClipAudioEffects(clip),
            ).some(
              (effect) => effect.enabled,
            );
          }),
      );

      if (hasActiveAudioEffects) {
        return { canUse: false, clips: [] };
      }

      if (allVideoClips.length === 0) return { canUse: false, clips: [] };

      allVideoClips.sort((a, b) => a.clip.startTime - b.clip.startTime);

      // Check for overlapping clips (multi-layer) - can't use native playback for compositing
      for (let i = 0; i < allVideoClips.length - 1; i++) {
        const current = allVideoClips[i];
        const next = allVideoClips[i + 1];
        const currentEnd = current.clip.startTime + current.clip.duration;
        if (next.clip.startTime < currentEnd) {
          return { canUse: false, clips: [] };
        }
      }

      // Note: Text/graphics overlays are now supported in native video playback
      // They are rendered using CPU canvas2D after the video frame

      // Collect image clips for background compositing (don't disable native playback)
      const imageTracks = tracks.filter((track) => !track.hidden);
      const imageClips: Array<{
        clip: PreviewTimelineClip;
        trackIndex: number;
      }> = [];
      imageTracks.forEach((track) => {
        const trackIndex = tracks.indexOf(track);
        for (const clip of track.clips) {
          if (getMediaItem(clip.mediaId)?.type === "image") {
            imageClips.push({ clip, trackIndex });
          }
        }
      });

      if (imageClips.some(({ clip }) => clipMasksById.has(clip.id))) {
        return { canUse: false, clips: [] };
      }

      return { canUse: true, clips: allVideoClips, imageClips };
    },
    [
      timelineTracks,
      getMediaItem,
      getResolvedClipAudioEffects,
      clipMasksById,
      mediaClipHasAudio,
    ],
  );

  return { renderFallbackFrame, canUseNativeVideoPlayback };
};
