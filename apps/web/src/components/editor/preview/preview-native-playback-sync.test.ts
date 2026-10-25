import { afterEach, describe, expect, it, vi } from "vitest";
import * as core from "@openreel/core";
import type { Track } from "@openreel/core";
import { syncVideoToClipTime } from "./preview-native-playback-sync";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncVideoToClipTime", () => {
  it("maps playback time through clip speed and source in-point before seeking", async () => {
    vi.spyOn(core, "getSpeedEngine").mockReturnValue({
      getSourceTimeAtPlaybackTime: (_clipId: string, localTime: number) =>
        localTime + 0.5,
    } as ReturnType<typeof core.getSpeedEngine>);
    vi.spyOn(core, "getVidstabEngine").mockReturnValue({
      hasStabilized: () => false,
    } as unknown as ReturnType<typeof core.getVidstabEngine>);

    const clip = {
      id: "clip-1",
      startTime: 1,
      duration: 5,
      inPoint: 2,
      outPoint: 7,
    } as Track["clips"][number];
    let currentTime = 0;
    const listeners = new Map<string, (event: Event) => void>();
    const video = {
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
      get currentTime() {
        return currentTime;
      },
      set currentTime(value: number) {
        currentTime = value;
        listeners.get("seeked")?.(new Event("seeked"));
      },
      addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    } as unknown as HTMLVideoElement;

    await syncVideoToClipTime(video, clip, 4.2);

    expect(currentTime).toBeCloseTo(5.7);
    expect(video.removeEventListener).toHaveBeenCalledWith(
      "seeked",
      expect.any(Function),
    );
  });
});
