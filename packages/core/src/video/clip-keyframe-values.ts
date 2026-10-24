import type { Clip, Keyframe, Transform } from "../types/timeline";
import { keyframeEngine } from "./keyframe-engine";

/** Shared clip keyframe property mappings and value helpers. */

export const CLIP_EFFECT_KEYFRAME_PROPERTIES = [
  { keyframeProp: "effect.brightness", effectType: "brightness", paramKey: "value" },
  { keyframeProp: "effect.contrast", effectType: "contrast", paramKey: "value" },
  { keyframeProp: "effect.saturation", effectType: "saturation", paramKey: "value" },
  { keyframeProp: "effect.blur", effectType: "blur", paramKey: "radius" },
] as const;

export const CLIP_TRANSFORM_KEYFRAME_PROPERTIES = [
  "position.x",
  "position.y",
  "scale.x",
  "scale.y",
  "rotation",
  "opacity",
] as const;

export const CLIP_KEYFRAME_TIME_TOLERANCE = 0.01;
const KEYFRAME_VALUE_TOLERANCE = 1e-6;

type ClipTime = Pick<Clip, "startTime" | "duration">;
type ClipPropertyValues = Pick<Clip, "transform" | "effects" | "volume">;
type TransformProperty = (typeof CLIP_TRANSFORM_KEYFRAME_PROPERTIES)[number];

export interface TransformKeyframeChange {
  keyframes: Keyframe[];
  transform: Transform;
}

export function getClipLocalTime(clip: ClipTime, playheadPosition: number): number {
  return Math.max(0, Math.min(clip.duration, playheadPosition - clip.startTime));
}

export function getClipPropertyBaseValue(
  clip: ClipPropertyValues,
  property: string,
): number | undefined {
  switch (property) {
    case "position.x":
      return clip.transform.position.x;
    case "position.y":
      return clip.transform.position.y;
    case "scale.x":
      return clip.transform.scale.x;
    case "scale.y":
      return clip.transform.scale.y;
    case "rotation":
      return clip.transform.rotation;
    case "opacity":
      return clip.transform.opacity;
    case "volume":
      return clip.volume;
    default:
      return getEffectBaseValue(clip, property);
  }
}

export function upsertClipKeyframe(
  keyframes: readonly Keyframe[],
  property: string,
  time: number,
  value: unknown,
): Keyframe[] {
  const existing = keyframes.find(
    (keyframe) =>
      keyframe.property === property &&
      Math.abs(keyframe.time - time) <= CLIP_KEYFRAME_TIME_TOLERANCE,
  );
  const nextKeyframe: Keyframe = existing
    ? { ...existing, time, value }
    : {
        id: crypto.randomUUID(),
        time,
        property,
        value,
        easing: "linear",
      };

  return [
    ...keyframes.filter((keyframe) => keyframe.id !== existing?.id),
    nextKeyframe,
  ].sort((a, b) => a.time - b.time);
}

export function applyTransformChangeToKeyframes(
  keyframes: readonly Keyframe[],
  currentTransform: Transform,
  nextTransform: Transform,
  localTime: number,
  editedProperties: readonly TransformProperty[],
): TransformKeyframeChange {
  let nextKeyframes = [...keyframes];
  let staticTransform = nextTransform;

  for (const property of CLIP_TRANSFORM_KEYFRAME_PROPERTIES) {
    const propertyKeyframes = keyframeEngine.getKeyframesForProperty(
      nextKeyframes,
      property,
    );
    if (propertyKeyframes.length === 0) continue;

    const animatedValue = keyframeEngine.getValueAtTime(
      propertyKeyframes,
      localTime,
    ).value;
    const requestedValue = getTransformProperty(nextTransform, property);
    if (
      editedProperties.includes(property) &&
      typeof animatedValue === "number" &&
      Math.abs(requestedValue - animatedValue) > KEYFRAME_VALUE_TOLERANCE
    ) {
      nextKeyframes = upsertClipKeyframe(
        nextKeyframes,
        property,
        localTime,
        requestedValue,
      );
    }
    staticTransform = setTransformProperty(
      staticTransform,
      property,
      getTransformProperty(currentTransform, property),
    );
  }

  return { keyframes: nextKeyframes, transform: staticTransform };
}

function getEffectBaseValue(clip: ClipPropertyValues, property: string): number | undefined {
  const mapping = CLIP_EFFECT_KEYFRAME_PROPERTIES.find(
    ({ keyframeProp }) => keyframeProp === property,
  );
  if (!mapping) return undefined;

  const effect = clip.effects.find(({ type }) => type === mapping.effectType);
  const value = effect?.params[mapping.paramKey];
  return typeof value === "number" ? value : undefined;
}

function getTransformProperty(transform: Transform, property: TransformProperty): number {
  switch (property) {
    case "position.x":
      return transform.position.x;
    case "position.y":
      return transform.position.y;
    case "scale.x":
      return transform.scale.x;
    case "scale.y":
      return transform.scale.y;
    case "rotation":
      return transform.rotation;
    case "opacity":
      return transform.opacity;
  }
}

function setTransformProperty(
  transform: Transform,
  property: TransformProperty,
  value: number,
): Transform {
  switch (property) {
    case "position.x":
      return { ...transform, position: { ...transform.position, x: value } };
    case "position.y":
      return { ...transform, position: { ...transform.position, y: value } };
    case "scale.x":
      return { ...transform, scale: { ...transform.scale, x: value } };
    case "scale.y":
      return { ...transform, scale: { ...transform.scale, y: value } };
    case "rotation":
      return { ...transform, rotation: value };
    case "opacity":
      return { ...transform, opacity: value };
  }
}
