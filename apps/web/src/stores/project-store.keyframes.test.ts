import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Clip, Project } from "@openreel/core";
import { useProjectStore } from "./project-store";
import { useTimelineStore } from "./timeline-store";

vi.mock("../services/auto-save", () => ({
  autoSaveManager: {
    startAutoSave: vi.fn(),
    stopAutoSave: vi.fn(),
    triggerSave: vi.fn(),
    getRecentSaves: vi.fn().mockResolvedValue([]),
    loadSave: vi.fn(),
    deleteSave: vi.fn(),
  },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

const makeClip = (keyframes: Clip["keyframes"]): Clip => ({
  id: "clip-1",
  mediaId: "media-1",
  trackId: "track-1",
  startTime: 5,
  duration: 20,
  inPoint: 0,
  outPoint: 20,
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
  keyframes,
});

const loadClip = (clip: Clip): void => {
  const currentProject = useProjectStore.getState().project;
  const track: Project["timeline"]["tracks"][number] = {
    id: "track-1",
    type: "video",
    name: "Video",
    clips: [clip],
    transitions: [],
    locked: false,
    hidden: false,
    muted: false,
    solo: false,
  };
  useProjectStore.setState({
    project: {
      ...currentProject,
      timeline: { ...currentProject.timeline, tracks: [track] },
    },
  });
  useTimelineStore.setState({ playheadPosition: 15 });
};

describe("ProjectStore clip transform keyframes", () => {
  beforeEach(() => {
    useProjectStore.getState().createNewProject("Keyframe test");
    useTimelineStore.setState({ playheadPosition: 0 });
  });

  it("writes a clip-local keyframe without changing the static transform", async () => {
    loadClip(makeClip([
      { id: "y-start", time: 0, property: "position.y", value: 0, easing: "linear" },
    ]));

    const result = await useProjectStore
      .getState()
      .updateClipTransform("clip-1", { position: { x: 0, y: 100 } });

    expect(result.success).toBe(true);
    const clip = useProjectStore.getState().project.timeline.tracks[0]?.clips[0];
    expect(clip?.transform.position.y).toBe(0);
    expect(clip?.keyframes).toEqual([
      { id: "y-start", time: 0, property: "position.y", value: 0, easing: "linear" },
      expect.objectContaining({ time: 10, property: "position.y", value: 100, easing: "linear" }),
    ]);
  });

  it("keeps static transform edits when the property has no keyframes", async () => {
    loadClip(makeClip([]));

    const result = await useProjectStore
      .getState()
      .updateClipTransform("clip-1", { position: { x: 0, y: 100 } });

    expect(result.success).toBe(true);
    const clip = useProjectStore.getState().project.timeline.tracks[0]?.clips[0];
    expect(clip?.transform.position.y).toBe(100);
    expect(clip?.keyframes).toEqual([]);
  });

  it("updates keyed and unkeyed axes independently", async () => {
    loadClip(makeClip([
      { id: "y-start", time: 0, property: "position.y", value: 0, easing: "linear" },
    ]));

    const result = await useProjectStore
      .getState()
      .updateClipTransform("clip-1", { position: { x: 50, y: 100 } });

    expect(result.success).toBe(true);
    const clip = useProjectStore.getState().project.timeline.tracks[0]?.clips[0];
    expect(clip?.transform.position).toEqual({ x: 50, y: 0 });
    expect(clip?.keyframes).toEqual([
      { id: "y-start", time: 0, property: "position.y", value: 0, easing: "linear" },
      expect.objectContaining({ time: 10, property: "position.y", value: 100, easing: "linear" }),
    ]);
  });

  it("does not create a position keyframe when only rotation is edited", async () => {
    const keyframes = [
      { id: "y-start", time: 0, property: "position.y", value: 200, easing: "linear" },
    ] satisfies Clip["keyframes"];
    loadClip(makeClip(keyframes));

    const result = await useProjectStore
      .getState()
      .updateClipTransform("clip-1", { rotation: 45 });

    expect(result.success).toBe(true);
    const clip = useProjectStore.getState().project.timeline.tracks[0]?.clips[0];
    expect(clip?.transform).toMatchObject({ rotation: 45, position: { y: 0 } });
    expect(clip?.keyframes).toEqual(keyframes);
  });
});
