import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewScrubBar } from "./PreviewScrubBar";

afterEach(cleanup);

function firePointer(
  element: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  values: { pointerId: number; clientX: number; button?: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { value });
  }
  fireEvent(element, event);
}

describe("PreviewScrubBar", () => {
  it("starts scrubbing, follows pointer moves, and ends at the final pointer position", () => {
    const onScrubStart = vi.fn();
    const onScrub = vi.fn();
    const onScrubEnd = vi.fn();
    const { container } = render(
      <PreviewScrubBar
        position={0}
        duration={10}
        onScrubStart={onScrubStart}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
      />,
    );
    const scrubBar = container.querySelector<HTMLElement>("[data-preview-scrub]");
    if (!scrubBar) throw new Error("Scrub bar was not rendered");
    vi.spyOn(scrubBar, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 0,
      left: 100,
      top: 0,
      right: 200,
      bottom: 6,
      width: 100,
      height: 6,
      toJSON: () => ({}),
    });

    act(() => {
      firePointer(scrubBar, "pointerdown", { pointerId: 1, clientX: 125, button: 0 });
      firePointer(scrubBar, "pointermove", { pointerId: 1, clientX: 150 });
      firePointer(scrubBar, "pointerup", { pointerId: 1, clientX: 175 });
    });

    expect(onScrubStart).toHaveBeenCalledOnce();
    expect(onScrub.mock.calls.map(([time]) => time)).toEqual([2.5, 5, 7.5]);
    expect(onScrubEnd).toHaveBeenCalledOnce();
  });

  it("clamps pointer positions to the start and end of the duration", () => {
    const onScrub = vi.fn();
    const { container } = render(
      <PreviewScrubBar position={0} duration={10} onScrubStart={vi.fn()} onScrub={onScrub} onScrubEnd={vi.fn()} />,
    );
    const scrubBar = container.querySelector<HTMLElement>("[data-preview-scrub]");
    if (!scrubBar) throw new Error("Scrub bar was not rendered");
    vi.spyOn(scrubBar, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 0, left: 100, top: 0, right: 200, bottom: 6, width: 100, height: 6, toJSON: () => ({}),
    });

    act(() => {
      firePointer(scrubBar, "pointerdown", { pointerId: 1, clientX: 50, button: 0 });
      firePointer(scrubBar, "pointerup", { pointerId: 1, clientX: 250 });
    });

    expect(onScrub.mock.calls.map(([time]) => time)).toEqual([0, 10]);
  });

  it("ends a cancelled drag and ignores later pointer moves", () => {
    const onScrub = vi.fn();
    const onScrubEnd = vi.fn();
    const { container } = render(
      <PreviewScrubBar position={0} duration={10} onScrubStart={vi.fn()} onScrub={onScrub} onScrubEnd={onScrubEnd} />,
    );
    const scrubBar = container.querySelector<HTMLElement>("[data-preview-scrub]");
    if (!scrubBar) throw new Error("Scrub bar was not rendered");
    vi.spyOn(scrubBar, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 0, left: 100, top: 0, right: 200, bottom: 6, width: 100, height: 6, toJSON: () => ({}),
    });

    act(() => {
      firePointer(scrubBar, "pointerdown", { pointerId: 1, clientX: 125, button: 0 });
      firePointer(scrubBar, "pointercancel", { pointerId: 1, clientX: 150 });
      firePointer(scrubBar, "pointermove", { pointerId: 1, clientX: 175 });
    });

    expect(onScrub.mock.calls.map(([time]) => time)).toEqual([2.5]);
    expect(onScrubEnd).toHaveBeenCalledOnce();
  });

  it("shows the current position as fill width", () => {
    const { container } = render(
      <PreviewScrubBar position={2.5} duration={10} onScrubStart={vi.fn()} onScrub={vi.fn()} onScrubEnd={vi.fn()} />,
    );

    expect(container.querySelector<HTMLElement>("[data-preview-scrub-fill]")?.style.width).toBe("25%");
  });
});
