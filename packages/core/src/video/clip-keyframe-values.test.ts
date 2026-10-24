import { describe, expect, it } from "vitest";
import type { Keyframe, Transform } from "../types/timeline";
import {
  applyTransformChangeToKeyframes,
  getClipLocalTime,
  getClipPropertyBaseValue,
  upsertClipKeyframe,
} from "./clip-keyframe-values";

const transform: Transform = {
  position: { x: 10, y: 200 },
  scale: { x: 1.5, y: 2 },
  rotation: 30,
  anchor: { x: 0.5, y: 0.5 },
  opacity: 0.75,
};

const clip = {
  startTime: 5,
  duration: 10,
  transform,
  effects: [
    { id: "brightness-1", type: "brightness", enabled: true, params: { value: 24 } },
    { id: "blur-1", type: "blur", enabled: true, params: { radius: 8 } },
  ],
  volume: 0.6,
};

const keyframe = (overrides: Partial<Keyframe> = {}): Keyframe => ({
  id: "keyframe-1",
  time: 0,
  property: "position.y",
  value: 0,
  easing: "linear",
  ...overrides,
});

describe("clip keyframe values", () => {
  it("converts the playhead to clamped clip-local time", () => {
    expect(getClipLocalTime(clip, 3)).toBe(0);
    expect(getClipLocalTime(clip, 15)).toBe(10);
    expect(getClipLocalTime(clip, 30)).toBe(10);
  });

  it("reads transform, effect, and volume base values", () => {
    expect(getClipPropertyBaseValue(clip, "position.y")).toBe(200);
    expect(getClipPropertyBaseValue(clip, "scale.x")).toBe(1.5);
    expect(getClipPropertyBaseValue(clip, "rotation")).toBe(30);
    expect(getClipPropertyBaseValue(clip, "opacity")).toBe(0.75);
    expect(getClipPropertyBaseValue(clip, "effect.brightness")).toBe(24);
    expect(getClipPropertyBaseValue(clip, "effect.blur")).toBe(8);
    expect(getClipPropertyBaseValue(clip, "volume")).toBe(0.6);
    expect(getClipPropertyBaseValue(clip, "unknown.property")).toBeUndefined();
  });

  it("updates a keyframe within tolerance and keeps its easing", () => {
    const existing = keyframe({ time: 2, easing: "ease-in" });

    expect(upsertClipKeyframe([existing], "position.y", 2.005, 100)).toEqual([
      { ...existing, time: 2.005, value: 100 },
    ]);
  });

  it("inserts a keyframe and sorts by time", () => {
    const later = keyframe({ id: "later", time: 8, value: 80 });
    const earlier = keyframe({ id: "earlier", time: 2, value: 20 });

    const result = upsertClipKeyframe([later], "position.y", 2, 20);

    expect(result).toHaveLength(2);
    expect(result.map(({ time }) => time)).toEqual([2, 8]);
    expect(result[0]).toMatchObject({ property: "position.y", time: 2, value: 20, easing: "linear" });
    expect(result[0]?.id).not.toBe(earlier.id);
  });

  it("passes static transform edits through when no properties are keyed", () => {
    const nextTransform = { ...transform, position: { x: 30, y: 240 } };

    expect(applyTransformChangeToKeyframes([], transform, nextTransform, 4, [])).toEqual({
      keyframes: [],
      transform: nextTransform,
    });
  });

  it("keys an animated axis while leaving an unanimated axis static", () => {
    const yKeyframe = keyframe();
    const nextTransform = { ...transform, position: { x: 30, y: 100 } };

    const result = applyTransformChangeToKeyframes(
      [yKeyframe],
      transform,
      nextTransform,
      10,
      ["position.y"],
    );

    expect(result.keyframes).toHaveLength(2);
    expect(result.keyframes[1]).toMatchObject({
      property: "position.y",
      time: 10,
      value: 100,
      easing: "linear",
    });
    expect(result.transform.position).toEqual({ x: 30, y: 200 });
  });

  it("does not add a keyframe when the requested value already matches animation", () => {
    const keyframes = [
      keyframe(),
      keyframe({ id: "keyframe-2", time: 10, value: 100 }),
    ];
    const nextTransform = { ...transform, position: { x: 10, y: 50 } };

    const result = applyTransformChangeToKeyframes(
      keyframes,
      transform,
      nextTransform,
      5,
      ["position.y"],
    );

    expect(result.keyframes).toEqual(keyframes);
    expect(result.transform.position.y).toBe(200);
  });

  it("does not key an animated position when only rotation was edited", () => {
    const positionKeyframe = keyframe({ time: 0, value: 0 });
    const rotationKeyframe = keyframe({
      id: "rotation-keyframe",
      property: "rotation",
      time: 0,
      value: 0,
    });
    const nextTransform = { ...transform, rotation: 45 };

    const result = applyTransformChangeToKeyframes(
      [positionKeyframe, rotationKeyframe],
      transform,
      nextTransform,
      5,
      ["rotation"],
      ["rotation"],
    );

    expect(result.keyframes).toEqual([
      positionKeyframe,
      rotationKeyframe,
      expect.objectContaining({
        property: "rotation",
        time: 5,
        value: 45,
      }),
    ]);
    expect(result.transform.position.y).toBe(200);
    expect(result.transform.rotation).toBe(30);
  });

  it("records the changed Y value at the supplied clip-local time", () => {
    const result = applyTransformChangeToKeyframes(
      [keyframe()],
      transform,
      { ...transform, position: { x: 10, y: 100 } },
      getClipLocalTime(clip, 15),
      ["position.y"],
    );

    expect(result.keyframes.map(({ time, value }) => ({ time, value }))).toEqual([
      { time: 0, value: 0 },
      { time: 10, value: 100 },
    ]);
  });
});
