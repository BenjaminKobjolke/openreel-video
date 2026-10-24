import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewPlaybackButtons } from "./PreviewPlaybackButtons";

afterEach(cleanup);

describe("PreviewPlaybackButtons", () => {
  it("shows skip back, play, and skip forward in order", () => {
    const { container } = render(
      <PreviewPlaybackButtons
        isPlaying={false}
        playbackLockedReason={null}
        onSkipBack={vi.fn()}
        onTogglePlayback={vi.fn()}
        onSkipForward={vi.fn()}
      />,
    );

    const playback = container.querySelector<HTMLElement>("[data-preview-playback]");
    if (!playback) throw new Error("Playback button group was not rendered");
    expect(within(playback).getAllByRole("button").map((button) => button.getAttribute("aria-label")))
      .toEqual(["Skip back 5s", "Play", "Skip forward 5s"]);
  });

  it("shows Pause while playing", () => {
    render(
      <PreviewPlaybackButtons
        isPlaying
        playbackLockedReason={null}
        onSkipBack={vi.fn()}
        onTogglePlayback={vi.fn()}
        onSkipForward={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("disables locked playback and calls each available handler", () => {
    const onSkipBack = vi.fn();
    const onTogglePlayback = vi.fn();
    const onSkipForward = vi.fn();
    render(
      <PreviewPlaybackButtons
        isPlaying={false}
        playbackLockedReason="Preparing preview"
        onSkipBack={onSkipBack}
        onTogglePlayback={onTogglePlayback}
        onSkipForward={onSkipForward}
      />,
    );

    expect(screen.getByRole("button", { name: "Preparing preview" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Skip back 5s" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip forward 5s" }));
    fireEvent.click(screen.getByRole("button", { name: "Preparing preview" }));

    expect(onSkipBack).toHaveBeenCalledOnce();
    expect(onSkipForward).toHaveBeenCalledOnce();
    expect(onTogglePlayback).not.toHaveBeenCalled();
  });

  it("calls the play handler when playback is available", () => {
    const onTogglePlayback = vi.fn();
    render(
      <PreviewPlaybackButtons
        isPlaying={false}
        playbackLockedReason={null}
        onSkipBack={vi.fn()}
        onTogglePlayback={onTogglePlayback}
        onSkipForward={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onTogglePlayback).toHaveBeenCalledOnce();
  });
});
