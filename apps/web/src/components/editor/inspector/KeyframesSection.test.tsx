import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Clip, Project } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { KeyframesSection } from "./KeyframesSection";

const clipId = "keyframe-test-clip";

const createProjectWithClip = (
  effects: Clip["effects"] = [],
  keyframes: Clip["keyframes"] = [],
): Project => {
  const project = useProjectStore.getState().project;
  return {
    ...project,
    timeline: {
      ...project.timeline,
      tracks: [
        {
          id: "track-video",
          type: "video",
          name: "V1",
          clips: [
            {
              id: clipId,
              mediaId: "media-1",
              trackId: "track-video",
              startTime: 5,
              duration: 20,
              inPoint: 0,
              outPoint: 20,
              effects,
              audioEffects: [],
              transform: {
                position: { x: 0, y: 200 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0.5, y: 0.5 },
                opacity: 1,
              },
              volume: 1,
              keyframes,
            },
          ],
          transitions: [],
          locked: false,
          hidden: false,
          muted: false,
          solo: false,
        },
      ],
    },
  } as Project;
};

describe("KeyframesSection", () => {
  beforeEach(() => {
    useProjectStore.setState({ project: createProjectWithClip() });
    useTimelineStore.setState({ playheadPosition: 15 });
  });

  afterEach(cleanup);

  it("uses clip-local time and captures the clip's transform value", () => {
    render(<KeyframesSection clipId={clipId} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Property" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Position Y" }));

    expect(screen.getByText("Value at 10.00s")).toBeInTheDocument();
    expect(screen.getByText("200.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Keyframe at 10.00s" }));

    expect(
      useProjectStore
        .getState()
        .project.timeline.tracks[0]?.clips[0]?.keyframes,
    ).toEqual([
      expect.objectContaining({
        time: 10,
        property: "position.y",
        value: 200,
        easing: "linear",
      }),
    ]);
  });

  it("captures the matching effect value for its first keyframe", () => {
    useProjectStore.setState({
      project: createProjectWithClip([
        {
          id: "brightness-1",
          type: "brightness",
          enabled: true,
          params: { value: 24 },
        },
      ]),
    });
    render(<KeyframesSection clipId={clipId} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Property" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Brightness" }));

    expect(screen.getByText("24.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Keyframe at 10.00s" }));

    expect(
      useProjectStore
        .getState()
        .project.timeline.tracks[0]?.clips[0]?.keyframes,
    ).toEqual([
      expect.objectContaining({
        time: 10,
        property: "effect.brightness",
        value: 24,
      }),
    ]);
  });

  it("evaluates existing keyframes and detects a local-time match", () => {
    useProjectStore.setState({
      project: createProjectWithClip([], [
        {
          id: "y-at-playhead",
          time: 10,
          property: "position.y",
          value: 300,
          easing: "linear",
        },
      ]),
    });
    render(<KeyframesSection clipId={clipId} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Property" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Position Y" }));

    expect(screen.getByText("Value at 10.00s")).toBeInTheDocument();
    expect(screen.getByText("300.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keyframe exists at 10.00s" }),
    ).toBeDisabled();
  });

  it("detects a keyframe exactly at the shared time tolerance", () => {
    useTimelineStore.setState({ playheadPosition: 5 });
    useProjectStore.setState({
      project: createProjectWithClip([], [
        {
          id: "y-at-tolerance-boundary",
          time: 0.01,
          property: "position.y",
          value: 300,
          easing: "linear",
        },
      ]),
    });
    render(<KeyframesSection clipId={clipId} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Property" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Position Y" }));

    expect(
      screen.getByRole("button", { name: "Keyframe exists at 0.00s" }),
    ).toBeDisabled();
  });
});
