/** Creates all mutable refs shared by Preview and its extracted hooks. */
import { useRef } from "react";
import { getRealtimeAudioGraph } from "@openreel/core";
import type {
  MotionRenderer,
  Project,
  Renderer,
  ShapeClip,
  StickerClip,
  Subtitle,
  SVGClip,
  TextClip,
  Track,
} from "@openreel/core";
import type { PreviewRefs } from "./preview-runtime-types";

interface PreviewRefInitialValues {
  previewBg: string;
  rendererInitialSize: { width: number; height: number };
  timelineTracks: Track[];
  canvasFillMode: "color" | "blur" | undefined;
  canvasFillColor: string | undefined;
  allTextClips: TextClip[];
  allShapeClips: Array<ShapeClip | SVGClip | StickerClip>;
  allSubtitles: Subtitle[];
  playbackRate: number;
  playheadPosition: number;
  renderFrameDirectly: (time: number) => Promise<boolean>;
  isPlaying: boolean;
  project: Project;
  proxySourceRevision: number;
}

export const usePreviewRefs = (initial: PreviewRefInitialValues): PreviewRefs => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoAreaRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const renderBridgeInitialized = useRef<boolean>(false);
  const lastGoodFrameRef = useRef<ImageBitmap | null>(null);
  const offscreenCanvasRef = useRef<OffscreenCanvas | null>(null);
  const decodeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decodeDebounceResolveRef = useRef<((value: ImageBitmap | null) => void) | null>(
    null,
  );
  const decodeRequestSeqRef = useRef(0);
  const scrubVideoReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastPreviewRenderTimeRef = useRef(0);
  const offscreenCtxRef = useRef<OffscreenCanvasRenderingContext2D | null>(
    null,
  );
  // Native video element for hardware-accelerated playback (much faster for 4K)
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const currentVideoMediaIdRef = useRef<string | null>(null);
  const nativePlaybackActiveRef = useRef<boolean>(false);
  const nativeVideoCacheRef = useRef<
    Map<string, { video: HTMLVideoElement; url: string }>
  >(new Map());
  const nativeImageBitmapCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioGraphRef = useRef<ReturnType<typeof getRealtimeAudioGraph> | null>(
    null,
  );
  const audioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const processedAudioBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const noAudioBufferRef = useRef<Set<string>>(new Set());
  const rendererRef = useRef<Renderer | null>(null);
  const rendererInitializedRef = useRef<boolean>(false);
  const motionRendererRef = useRef<MotionRenderer | null>(null);
  const motionAssetBitmapCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  // The preview canvas background / letterbox bars. A project "color" canvas
  // fill overrides the theme stage so the preview matches the exported video;
  // otherwise the bars follow the theme (--screen-bg token). Kept in a ref so
  // every render path (scrub, playback, transitions) picks up the current
  // value without re-creating callbacks. (Blur fill draws a cover-fit blurred
  // backdrop of the base clip in both preview and export.)
  const previewBgRef = useRef<string>(initial.previewBg);
  const interactionStartRef = useRef<{
    x: number;
    y: number;
    transform: { x: number; y: number; scaleX: number; scaleY: number };
  } | null>(null);
  const pendingTransformRef = useRef<{
    clipId: string;
    transform: {
      position?: { x: number; y: number };
      scale?: { x: number; y: number };
    };
  } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  // Track if we're currently interacting to prevent re-renders during resize/move
  const isInteractingRef = useRef<boolean>(false);
  // Throttle store updates during interaction (update at most every 32ms ~30fps)
  const lastStoreUpdateRef = useRef<number>(0);
  // Throttle playhead updates during playback to reduce React re-renders.
  // The interval follows the project timebase so 60 fps projects publish a
  // 60 Hz playhead instead of being capped at 30 Hz.
  const lastPlayheadUpdateRef = useRef<number>(0);
  const interactionTargetIdRef = useRef<string | null>(null);
  // Video element cache for native hardware-accelerated frame decoding (thumbnails/scrubbing)
  // Much more reliable than MediaBunny's CanvasSink for random-access seeking
  const videoElementCacheRef = useRef<
    Map<string, { video: HTMLVideoElement; url: string; lastUsed: number }>
  >(new Map());
  // Persistent decoder cache for efficient playback (legacy - kept for fallback)
  const decoderCacheRef = useRef<
    Map<
      string,
      {
        input: { [Symbol.dispose]?: () => void };
        sink: unknown;
        mediaId: string;
        lastUsed: number;
      }
    >
  >(new Map());
  const rendererInitialSizeRef = useRef(initial.rendererInitialSize);
  // Keep a ref to timelineTracks for use in playback effect without causing re-runs
  const timelineTracksRef = useRef(initial.timelineTracks);
  // Current canvas fill mode in a ref so the (stable) preview-background
  // helper always reads the latest value even when the big render callbacks
  // captured it before the mode changed.
  const canvasFillModeRef = useRef(initial.canvasFillMode);
  const canvasFillColorRef = useRef(initial.canvasFillColor);
  // Keep a ref to allTextClips for use in playback effect
  const allTextClipsRef = useRef(initial.allTextClips);
  const allShapeClipsRef = useRef(initial.allShapeClips);
  // Keep a ref to allSubtitles for use in playback effect
  const allSubtitlesRef = useRef(initial.allSubtitles);
  // Keep a ref to isScrubbing for use in playback loop
  const isScrubbingRef = useRef(false);
  const rateRef = useRef(initial.playbackRate);
  const startPositionRef = useRef(initial.playheadPosition);
  // MediaBunny playback resources - map of clipId to resources for multi-track playback
  const playbackResourcesRef = useRef<
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
  >(new Map());
  const imageBitmapCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const failedImageDecodesRef = useRef<Set<string>>(new Set());
  // Pre-warm audio decode caches when the timeline settles after an edit (e.g.
  // moving/adding a clip), so the realtime scheduler finds decoded buffers ready
  // on the first play tick instead of silently dropping clips until a lazy decode
  // lands (~0.5-1s "lag then smooth"). Debounced so it never runs mid-drag, and
  // skipped during playback. preDecodeAllAudioBuffers is idempotent (cached and
  // negatively-cached buffers are no-ops), so re-warming after each edit is cheap.
  const audioWarmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioWarmupIdleRef = useRef<number | null>(null);
  const renderFrameDirectlyRef = useRef(initial.renderFrameDirectly);
  const isPlayingRef = useRef(initial.isPlaying);
  const playheadPositionRef = useRef(initial.playheadPosition);
  const lastProjectForRenderRef = useRef(initial.project);
  const lastProxyRevisionForRenderRef = useRef(initial.proxySourceRevision);
  const lastPlayheadForRenderRef = useRef<number>(initial.playheadPosition);
  const modifiedRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderInFlightRef = useRef<boolean>(false);
  const pendingRenderTimeRef = useRef<number | null>(null);
  return {
    canvasRef,
    containerRef,
    videoAreaRef,
    overlayRef,
    animationRef,
    renderBridgeInitialized,
    lastGoodFrameRef,
    offscreenCanvasRef,
    decodeDebounceRef,
    decodeDebounceResolveRef,
    decodeRequestSeqRef,
    scrubVideoReleaseTimerRef,
    lastPreviewRenderTimeRef,
    offscreenCtxRef,
    videoElementRef,
    videoUrlRef,
    currentVideoMediaIdRef,
    nativePlaybackActiveRef,
    nativeVideoCacheRef,
    nativeImageBitmapCacheRef,
    audioSourceRef,
    gainNodeRef,
    audioGraphRef,
    audioBufferCacheRef,
    processedAudioBufferCacheRef,
    noAudioBufferRef,
    rendererRef,
    rendererInitializedRef,
    motionRendererRef,
    motionAssetBitmapCacheRef,
    previewBgRef,
    interactionStartRef,
    pendingTransformRef,
    rafIdRef,
    isInteractingRef,
    lastStoreUpdateRef,
    lastPlayheadUpdateRef,
    interactionTargetIdRef,
    videoElementCacheRef,
    decoderCacheRef,
    rendererInitialSizeRef,
    timelineTracksRef,
    canvasFillModeRef,
    canvasFillColorRef,
    allTextClipsRef,
    allShapeClipsRef,
    allSubtitlesRef,
    isScrubbingRef,
    rateRef,
    startPositionRef,
    playbackResourcesRef,
    imageBitmapCacheRef,
    failedImageDecodesRef,
    audioWarmupTimerRef,
    audioWarmupIdleRef,
    renderFrameDirectlyRef,
    isPlayingRef,
    playheadPositionRef,
    lastProjectForRenderRef,
    lastProxyRevisionForRenderRef,
    lastPlayheadForRenderRef,
    modifiedRenderTimerRef,
    renderInFlightRef,
    pendingRenderTimeRef,
  };
};
