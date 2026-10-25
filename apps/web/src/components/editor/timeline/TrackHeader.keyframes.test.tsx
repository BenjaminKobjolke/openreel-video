import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Track } from "@openreel/core";
import { createEmptyProject } from "../../../stores/project/project-helpers";
import { useProjectStore } from "../../../stores/project-store";
import { TrackHeader } from "./TrackHeader";

const noop = () => undefined;

function track(id: string, name: string, type: "video" | "audio"): Track {
  return {
    id,
    type,
    name,
    clips: [{
      id: `${id}-clip`,
      mediaId: `${id}-media`,
      trackId: id,
      startTime: 0,
      duration: 5,
      inPoint: 0,
      outPoint: 5,
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
    }],
    transitions: [],
    locked: false,
    hidden: false,
    muted: false,
    solo: false,
  };
}

function LiveHeader({ trackId }: { trackId: string }) {
  const selectedTrack = useProjectStore((state) =>
    state.project.timeline.tracks.find((candidate) => candidate.id === trackId),
  );
  if (!selectedTrack) return null;

  return (
    <TrackHeader
      track={selectedTrack}
      index={0}
      onDragStart={noop}
      onDragOver={noop}
      onDrop={noop}
      onDragEnd={noop}
    />
  );
}

describe("TrackHeader keyframe recording", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const project = createEmptyProject("Keyframe recording controls");
    useProjectStore.setState({
      hasOpenProject: true,
      project: {
        ...project,
        mediaLibrary: {
          items: ["video", "audio"].map((id) => ({
            id: `${id}-track-media`,
            name: id,
            type: id as "video" | "audio",
            fileHandle: null,
            blob: null,
            metadata: {
              duration: 5,
              width: id === "video" ? 1920 : 0,
              height: id === "video" ? 1080 : 0,
              frameRate: id === "video" ? 30 : 0,
              codec: id === "video" ? "h264" : "aac",
              sampleRate: 48_000,
              channels: 2,
              fileSize: 1,
            },
            thumbnailUrl: null,
            waveformData: null,
          })),
        },
        timeline: {
          ...project.timeline,
          tracks: [
            track("video-track", "Video", "video"),
            track("audio-track", "Audio", "audio"),
          ],
        },
      },
    });
    useProjectStore.getState().actionExecutor.getHistory().clear();
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    useProjectStore.setState({ hasOpenProject: false });
  });

  it("toggles recording and shows the dot on a visual track", async () => {
    render(<LiveHeader trackId="video-track" />);
    expect(screen.queryByLabelText("Recording keyframes")).toBeNull();

    const options = screen.getByRole("button", { name: "Options for Video" });
    fireEvent.keyDown(options, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Record keyframes" }));

    await waitFor(() => {
      expect(useProjectStore.getState().project.timeline.tracks[0]?.keyframeRecording).toBe(true);
    });
    expect(await screen.findByLabelText("Recording keyframes")).toBeInTheDocument();

    fireEvent.keyDown(options, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Stop recording keyframes" }));

    await waitFor(() => {
      expect(useProjectStore.getState().project.timeline.tracks[0]?.keyframeRecording).toBe(false);
    });
    expect(screen.queryByLabelText("Recording keyframes")).toBeNull();
  });

  it("omits the entry and indicator on an audio-only track", () => {
    render(<LiveHeader trackId="audio-track" />);
    expect(screen.queryByLabelText("Recording keyframes")).toBeNull();

    fireEvent.keyDown(screen.getByRole("button", { name: "Options for Audio" }), { key: "Enter" });
    expect(screen.queryByRole("menuitem", { name: "Record keyframes" })).toBeNull();
  });
});
