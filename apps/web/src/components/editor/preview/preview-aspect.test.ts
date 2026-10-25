import { describe, expect, it } from "vitest";
import { aspectLabelFor, computeFitScale } from "./preview-aspect";

describe("aspectLabelFor", () => {
  it.each([
    [1920, 1080, "16:9"],
    [1080, 1920, "9:16"],
    [1080, 1080, "1:1"],
    [1000, 1000, "1:1"],
    [1000, 700, "Custom"],
  ])("labels %ix%i as %s", (width, height, label) => {
    expect(aspectLabelFor(width, height)).toBe(label);
  });
});

describe("computeFitScale", () => {
  it("contains a landscape source inside a portrait canvas", () => {
    expect(computeFitScale("contain", 1920, 1080, 1080, 1920)).toEqual({
      x: 1,
      y: 0.31640625,
    });
  });

  it("covers a portrait canvas without distorting the source", () => {
    const scale = computeFitScale("cover", 1920, 1080, 1080, 1920);
    expect(scale.x).toBeCloseTo(3.1604938, 6);
    expect(scale.y).toBe(1);
  });
});
