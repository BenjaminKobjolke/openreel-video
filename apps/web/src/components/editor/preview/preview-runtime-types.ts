/** Shared types for preview hooks and render helpers. */

import type { RefObject } from "react";
import type {
  MediaItem,
  MotionRenderer,
  Project,
  RealtimeAudioGraph,
  Renderer,
  ShapeClip,
  StickerClip,
  SVGClip,
  Subtitle,
  TextClip,
  Track,
} from "@openreel/core";
import type { drawFrameWithTransform } from "./canvas-renderers";
import type { ClipTransform } from "./types";

export interface GPULayer {
  bitmap: ImageBitmap;
  transform: ClipTransform;
}

export interface PreparedPreviewFrame {
  frame: ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
  cleanup: () => void;
}

export type PreviewClip = Track["clips"][number];

export type PreviewFrameSource = Parameters<typeof drawFrameWithTransform>[1];

export interface ClipWithPlaceholder {
  isPlaceholder?: boolean;
}

export interface PreviewRefs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  videoAreaRef: RefObject<HTMLDivElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  animationRef: RefObject<number | null>;
  renderBridgeInitialized: RefObject<boolean>;
  lastGoodFrameRef: RefObject<ImageBitmap | null>;
  offscreenCanvasRef: RefObject<OffscreenCanvas | null>;
  decodeDebounceRef: RefObject<ReturnType<typeof setTimeout> | null>;
  decodeDebounceResolveRef: RefObject<((value: ImageBitmap | null) => void) | null>;
  decodeRequestSeqRef: RefObject<number>;
  scrubVideoReleaseTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  lastPreviewRenderTimeRef: RefObject<number>;
  offscreenCtxRef: RefObject<OffscreenCanvasRenderingContext2D | null>;
  videoElementRef: RefObject<HTMLVideoElement | null>;
  videoUrlRef: RefObject<string | null>;
  currentVideoMediaIdRef: RefObject<string | null>;
  nativePlaybackActiveRef: RefObject<boolean>;
  nativeVideoCacheRef: RefObject<
    Map<string, { video: HTMLVideoElement; url: string }>
  >;
  nativeImageBitmapCacheRef: RefObject<Map<string, ImageBitmap>>;
  audioSourceRef: RefObject<AudioBufferSourceNode | null>;
  gainNodeRef: RefObject<GainNode | null>;
  audioGraphRef: RefObject<RealtimeAudioGraph | null>;
  audioBufferCacheRef: RefObject<Map<string, AudioBuffer>>;
  processedAudioBufferCacheRef: RefObject<Map<string, AudioBuffer>>;
  noAudioBufferRef: RefObject<Set<string>>;
  rendererRef: RefObject<Renderer | null>;
  rendererInitializedRef: RefObject<boolean>;
  motionRendererRef: RefObject<MotionRenderer | null>;
  motionAssetBitmapCacheRef: RefObject<Map<string, ImageBitmap>>;
  previewBgRef: RefObject<string>;
  interactionStartRef: RefObject<{
    x: number;
    y: number;
    transform: { x: number; y: number; scaleX: number; scaleY: number };
  } | null>;
  pendingTransformRef: RefObject<{
    clipId: string;
    transform: {
      position?: { x: number; y: number };
      scale?: { x: number; y: number };
    };
  } | null>;
  rafIdRef: RefObject<number | null>;
  isInteractingRef: RefObject<boolean>;
  lastStoreUpdateRef: RefObject<number>;
  lastPlayheadUpdateRef: RefObject<number>;
  interactionTargetIdRef: RefObject<string | null>;
  videoElementCacheRef: RefObject<
    Map<
      string,
      { video: HTMLVideoElement; url: string; lastUsed: number }
    >
  >;
  decoderCacheRef: RefObject<
    Map<
      string,
      {
        input: { [Symbol.dispose]?: () => void };
        sink: unknown;
        mediaId: string;
        lastUsed: number;
      }
    >
  >;
  rendererInitialSizeRef: RefObject<{ width: number; height: number }>;
  timelineTracksRef: RefObject<Track[]>;
  canvasFillModeRef: RefObject<"color" | "blur" | undefined>;
  canvasFillColorRef: RefObject<string | undefined>;
  allTextClipsRef: RefObject<TextClip[]>;
  allShapeClipsRef: RefObject<(ShapeClip | SVGClip | StickerClip)[]>;
  allSubtitlesRef: RefObject<Subtitle[]>;
  isScrubbingRef: RefObject<boolean>;
  rateRef: RefObject<number>;
  startPositionRef: RefObject<number>;
  playbackResourcesRef: RefObject<
    Map<
      string,
      {
        input: { [Symbol.dispose]?: () => void };
        sink: unknown;
        mediaId: string;
        clipId: string;
        trackIndex: number;
      }
    >
  >;
  imageBitmapCacheRef: RefObject<Map<string, ImageBitmap>>;
  failedImageDecodesRef: RefObject<Set<string>>;
  audioWarmupTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  audioWarmupIdleRef: RefObject<number | null>;
  renderFrameDirectlyRef: RefObject<(time: number) => Promise<boolean>>;
  isPlayingRef: RefObject<boolean>;
  playheadPositionRef: RefObject<number>;
  lastProjectForRenderRef: RefObject<Project>;
  lastProxyRevisionForRenderRef: RefObject<number>;
  lastPlayheadForRenderRef: RefObject<number>;
  modifiedRenderTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  renderInFlightRef: RefObject<boolean>;
  pendingRenderTimeRef: RefObject<number | null>;
}

export interface MultiTrackPlaybackState {
  lastFrameTimestamp: number;
  isProcessingFrame: boolean;
}

export interface MultiTrackPlaybackContext {
  refs: PreviewRefs;
  project: Project;
  previewRes: { scale: number };
  actualEndTime: number;
  playbackStartPosition: number;
  editingFrameDuration: number;
  isMuted: boolean;
  isActive: () => boolean;
  pause: () => void;
  setPlayheadPosition: (time: number) => void;
  cleanupPlaybackResources: () => void;
  cleanupAudioResources: () => void;
  getMediaItem: (id: string) => MediaItem | undefined;
  failProxyPlayback: (mediaId: string, blob: Blob) => void;
  clipMasksById: ReadonlyMap<string, unknown>;
  getAudioClipsForScheduler: Parameters<RealtimeAudioGraph["startScheduler"]>[0];
  preDecodeAllAudioBuffers: () => Promise<void>;
  mediaClipHasVisual: (clip: PreviewClip) => boolean;
  mediaClipHasAudio: (clip: PreviewClip) => boolean;
  hasActiveMotionInstances: (time: number) => boolean;
  renderMotionInstancesForTrack: (
    ctx: CanvasRenderingContext2D,
    track: Track,
    time: number,
    canvasWidth: number,
    canvasHeight: number,
  ) => Promise<boolean>;
  drawClipFrame: (
    ctx: CanvasRenderingContext2D,
    clipId: string,
    frame: ImageBitmap | HTMLCanvasElement | OffscreenCanvas,
    transform: ClipTransform,
    canvasWidth: number,
    canvasHeight: number,
    time: number,
  ) => Promise<void>;
  fillPreviewBackground: (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    time: number,
    width: number,
    height: number,
  ) => void;
}

export interface MultiTrackPlaybackRun {
  state: MultiTrackPlaybackState;
  frameDuration: number;
  masterClock: ReturnType<typeof import("@openreel/core").getMasterClock>;
  audioGraph: RealtimeAudioGraph;
  mainCtx: CanvasRenderingContext2D;
  ctx: CanvasRenderingContext2D;
}
