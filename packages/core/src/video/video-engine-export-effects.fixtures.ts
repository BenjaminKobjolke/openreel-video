import { vi } from "vitest";
import type { Project } from "../types/project";
import type { Clip, Effect, Transform } from "../types/timeline";
import type {
  ClipColorGrading,
  ColorWheelValues,
  CurvesValues,
  HSLValues,
} from "./color-grading-engine";

export const makeBitmap = (id: string, width = 640, height = 360): ImageBitmap =>
  ({
    id,
    width,
    height,
    close: vi.fn(),
  }) as unknown as ImageBitmap;

export const transform: Transform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
  opacity: 1,
  fitMode: "contain",
};

export const curves: CurvesValues = {
  rgb: [
    { x: 0, y: 0 },
    { x: 1, y: 0.85 },
  ],
  red: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  green: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  blue: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
};

export const colorWheels: ColorWheelValues = {
  shadows: { r: 0.12, g: -0.04, b: -0.08 },
  midtones: { r: 0, g: 0, b: 0 },
  highlights: { r: 0, g: 0, b: 0 },
  shadowsLift: 0,
  midtonesGamma: 1,
  highlightsGain: 1,
};

export const hsl: HSLValues = {
  hue: [12, 0, 0, 0, 0, 0, 0, 0],
  saturation: [0, 0.2, 0, 0, 0, 0, 0, 0],
  luminance: [0, 0, -0.1, 0, 0, 0, 0, 0],
};

export const lut = {
  data: [0, 0, 0, 255, 255, 255],
  size: 2,
  intensity: 0.5,
};

export const makeClip = (
  effects: Effect[],
  colorGrading: ClipColorGrading,
): Clip => ({
  id: "clip-1",
  mediaId: "media-1",
  trackId: "track-1",
  startTime: 0,
  duration: 5,
  inPoint: 0,
  outPoint: 5,
  effects,
  audioEffects: [],
  transform,
  colorGrading,
  volume: 1,
  keyframes: [],
});

export const makeProject = (clip: Clip): Project => ({
  id: "project-1",
  name: "Export effects",
  createdAt: 0,
  modifiedAt: 0,
  settings: {
    width: 640,
    height: 360,
    frameRate: 30,
    sampleRate: 48000,
    channels: 2,
  },
  mediaLibrary: {
    items: [
      {
        id: "media-1",
        name: "clip.mp4",
        type: "video",
        fileHandle: null,
        blob: new Blob(["video"]),
        metadata: {
          duration: 5,
          width: 640,
          height: 360,
          frameRate: 30,
          codec: "h264",
          sampleRate: 48000,
          channels: 2,
          fileSize: 1024,
        },
        thumbnailUrl: null,
        waveformData: null,
      },
    ],
  },
  timeline: {
    tracks: [
      {
        id: "track-1",
        type: "video",
        name: "Video",
        clips: [clip],
        transitions: [],
        locked: false,
        hidden: false,
        muted: false,
        solo: false,
      },
    ],
    subtitles: [],
    duration: 5,
    markers: [],
  },
});
