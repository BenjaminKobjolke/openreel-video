import { describe, expect, it } from "vitest";
import type { MediaItem, Track } from "@openreel/core";
import { getBehindSubjectStreamId } from "./preview-subject-mask";

describe("getBehindSubjectStreamId", () => {
  it("returns a stable sorted id for visible clips active at the requested time", () => {
    const createTrack = (
      id: string,
      hidden: boolean,
      clipId: string,
      startTime: number,
      duration: number,
    ): Track =>
      ({
        id,
        hidden,
        clips: [{ id: clipId, mediaId: "video", startTime, duration }],
      }) as Track;
    const tracks = [
      createTrack("top", false, "clip-b", 1, 4),
      createTrack("hidden", true, "clip-hidden", 1, 4),
      createTrack("bottom", false, "clip-a", 0, 2),
    ];
    const mediaItem = {
      type: "video",
      metadata: { hasVideo: true },
    } as MediaItem;

    expect(
      getBehindSubjectStreamId(tracks, 1, (mediaId) =>
        mediaId === "video" ? mediaItem : undefined,
      ),
    ).toBe("editor:text-behind-subject:clip-a|clip-b");
  });

  it("uses the canvas stream when there is no active visual clip", () => {
    expect(getBehindSubjectStreamId([], 1, () => undefined)).toBe(
      "editor:text-behind-subject:canvas",
    );
  });
});
