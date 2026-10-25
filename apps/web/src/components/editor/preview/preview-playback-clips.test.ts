import { describe, expect, it } from "vitest";
import type { Track } from "@openreel/core";
import {
  findAllClipsAtTime,
  findClipAtTime,
  findNextClipStartTime,
} from "./preview-playback-clips";

const createTrack = (
  id: string,
  clips: Track["clips"],
  overrides: Partial<Track> = {},
): Track => ({
  id,
  type: "video",
  name: id,
  clips,
  transitions: [],
  locked: false,
  hidden: false,
  muted: false,
  solo: false,
  ...overrides,
});

const createClip = (
  id: string,
  startTime: number,
  duration: number,
): Track["clips"][number] => ({
  id,
  mediaId: id,
  trackId: `track-${id}`,
  startTime,
  duration,
  inPoint: 0,
  outPoint: duration,
  effects: [],
  audioEffects: [],
  transform: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0.5, y: 0.5 },
    opacity: 1,
  },
  volume: 1,
  keyframes: [],
});

const isVisual = (clip: Track["clips"][number]) => clip.mediaId !== "audio";

describe("preview playback clip selection", () => {
  it("returns no active clip during a gap", () => {
    const tracks = [createTrack("main", [createClip("before", 0, 1), createClip("after", 2, 1)])];

    expect(findAllClipsAtTime(tracks, 1.5, isVisual)).toEqual([]);
    expect(findClipAtTime(tracks, 1.5, isVisual)).toBeNull();
  });

  it("keeps overlapping clips in timeline track order and selects the first", () => {
    const first = createClip("first", 0, 3);
    const second = createClip("second", 1, 2);
    const tracks = [createTrack("bottom", [first]), createTrack("top", [second])];

    expect(findAllClipsAtTime(tracks, 1.5, isVisual).map(({ clip }) => clip.id)).toEqual([
      "first",
      "second",
    ]);
    expect(findClipAtTime(tracks, 1.5, isVisual)?.clip.id).toBe("first");
  });

  it("ignores hidden tracks but includes muted visual tracks", () => {
    const tracks = [
      createTrack("hidden", [createClip("hidden-clip", 0, 3)], { hidden: true }),
      createTrack("muted", [createClip("muted-clip", 0, 3)], { muted: true }),
    ];

    expect(findAllClipsAtTime(tracks, 1, isVisual).map(({ clip }) => clip.id)).toEqual([
      "muted-clip",
    ]);
    expect(findNextClipStartTime(tracks, 0, isVisual)).toBeNull();
  });

  it("returns the earliest later visual clip start, ignoring hidden tracks", () => {
    const tracks = [
      createTrack("main", [createClip("later", 4, 1), createClip("nearer", 2, 1)]),
      createTrack("hidden", [createClip("hidden-later", 1, 1)], { hidden: true }),
    ];

    expect(findNextClipStartTime(tracks, 1, isVisual)).toBe(2);
  });
});
