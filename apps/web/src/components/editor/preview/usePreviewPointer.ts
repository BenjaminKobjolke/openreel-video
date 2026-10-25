import { useCallback, useEffect } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { SelectionItem } from "../../../stores/ui-store";
import type { ShapeClip, StickerClip, SVGClip } from "@openreel/core";
import type { TextClip } from "@openreel/core";
import type { PreviewClip, PreviewRefs } from "./preview-runtime-types";
import type { ClipTransform, InteractionMode, HandlePosition } from "./types";

interface PreviewPointerOptions {
  interactionMode: string;
  findGraphicClipAtPoint: (clientX: number, clientY: number) => ShapeClip | SVGClip | StickerClip | null;
  setHoveredGraphicClipId: (clipId: string | null) => void;
  select: (selection: SelectionItem) => void;
}

export function usePreviewPointer({
  interactionMode,
  findGraphicClipAtPoint,
  setHoveredGraphicClipId,
  select,
}: PreviewPointerOptions) {
  const handleGraphicsMouseMove = useCallback((event: MouseEvent) => {
    if (interactionMode !== "none") {
      setHoveredGraphicClipId(null);
      return;
    }
    const clip = findGraphicClipAtPoint(event.clientX, event.clientY);
    setHoveredGraphicClipId(clip ? clip.id : null);
  }, [interactionMode, findGraphicClipAtPoint]);

  const handleGraphicsClick = useCallback((event: MouseEvent) => {
    if (interactionMode !== "none") return;
    const clip = findGraphicClipAtPoint(event.clientX, event.clientY);
    if (clip) {
      select({ type: "shape-clip", id: clip.id });
      event.stopPropagation();
    }
  }, [interactionMode, findGraphicClipAtPoint, select]);

  return { handleGraphicsMouseMove, handleGraphicsClick };
}

interface PreviewPointerStartOptions {
  refs: PreviewRefs;
  selectedClip: PreviewClip | null;
  clipAtPlayhead: PreviewClip | null;
  activeTextClip: TextClip | null;
  activeShapeClip: ShapeClip | SVGClip | StickerClip | null;
  getTransformAtPlayhead: (clip: PreviewClip) => ClipTransform;
  setInteractionMode: Dispatch<SetStateAction<InteractionMode>>;
  setActiveHandle: Dispatch<SetStateAction<HandlePosition | null>>;
  setInteractionTargetType: Dispatch<SetStateAction<"clip" | "text-clip" | "shape-clip" | null>>;
}

export function usePreviewPointerStart({
  refs,
  selectedClip,
  clipAtPlayhead,
  activeTextClip,
  activeShapeClip,
  getTransformAtPlayhead,
  setInteractionMode,
  setActiveHandle,
  setInteractionTargetType,
}: PreviewPointerStartOptions) {
  const { isInteractingRef, interactionStartRef, interactionTargetIdRef } = refs;

  const handleHandleMouseDown = useCallback((event: MouseEvent, handle: HandlePosition) => {
    event.stopPropagation();
    event.preventDefault();
    const clip = selectedClip || clipAtPlayhead;
    if (!clip) return;
    const transform = getTransformAtPlayhead(clip);
    isInteractingRef.current = true;
    setInteractionMode("resize");
    setActiveHandle(handle);
    interactionStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      transform: {
        x: transform.position.x,
        y: transform.position.y,
        scaleX: transform.scale.x,
        scaleY: transform.scale.y,
      },
    };
  }, [selectedClip, clipAtPlayhead, getTransformAtPlayhead]);

  const handleClipMouseDown = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const clip = selectedClip || clipAtPlayhead;
    if (!clip) return;
    const transform = getTransformAtPlayhead(clip);
    isInteractingRef.current = true;
    setInteractionMode("move");
    interactionStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      transform: {
        x: transform.position.x,
        y: transform.position.y,
        scaleX: transform.scale.x,
        scaleY: transform.scale.y,
      },
    };
  }, [selectedClip, clipAtPlayhead, getTransformAtPlayhead]);

  const handleTextClipMouseDown = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!activeTextClip) return;
    const { transform } = activeTextClip;
    isInteractingRef.current = true;
    setInteractionMode("move");
    setInteractionTargetType("text-clip");
    interactionTargetIdRef.current = activeTextClip.id;
    interactionStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      transform: { x: transform.position.x, y: transform.position.y, scaleX: transform.scale.x, scaleY: transform.scale.y },
    };
  }, [activeTextClip]);

  const handleTextHandleMouseDown = useCallback((event: MouseEvent, handle: HandlePosition) => {
    event.stopPropagation();
    event.preventDefault();
    if (!activeTextClip) return;
    const { transform } = activeTextClip;
    isInteractingRef.current = true;
    setInteractionMode("resize");
    setActiveHandle(handle);
    setInteractionTargetType("text-clip");
    interactionTargetIdRef.current = activeTextClip.id;
    interactionStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      transform: { x: transform.position.x, y: transform.position.y, scaleX: transform.scale.x, scaleY: transform.scale.y },
    };
  }, [activeTextClip]);

  const handleShapeClipMouseDown = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!activeShapeClip) return;
    const { transform } = activeShapeClip;
    isInteractingRef.current = true;
    setInteractionMode("move");
    setInteractionTargetType("shape-clip");
    interactionTargetIdRef.current = activeShapeClip.id;
    interactionStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      transform: { x: transform.position.x, y: transform.position.y, scaleX: transform.scale.x, scaleY: transform.scale.y },
    };
  }, [activeShapeClip]);

  const handleShapeHandleMouseDown = useCallback((event: MouseEvent, handle: HandlePosition) => {
    event.stopPropagation();
    event.preventDefault();
    if (!activeShapeClip) return;
    const { transform } = activeShapeClip;
    isInteractingRef.current = true;
    setInteractionMode("resize");
    setActiveHandle(handle);
    setInteractionTargetType("shape-clip");
    interactionTargetIdRef.current = activeShapeClip.id;
    interactionStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      transform: { x: transform.position.x, y: transform.position.y, scaleX: transform.scale.x, scaleY: transform.scale.y },
    };
  }, [activeShapeClip]);

  return { handleHandleMouseDown, handleClipMouseDown, handleTextClipMouseDown,
    handleTextHandleMouseDown, handleShapeClipMouseDown, handleShapeHandleMouseDown };
}

interface PreviewPointerEndOptions {
  refs: PreviewRefs;
  setInteractionTargetType: Dispatch<SetStateAction<"clip" | "text-clip" | "shape-clip" | null>>;
  setInteractionMode: Dispatch<SetStateAction<InteractionMode>>;
  setActiveHandle: Dispatch<SetStateAction<HandlePosition | null>>;
  setLiveTransform: Dispatch<SetStateAction<{ position: { x: number; y: number }; scale: { x: number; y: number } } | null>>;
  setCanvasSnapGuides: (guides: { x: number | null; y: number | null }) => void;
  updateClipTransform: (clipId: string, transform: {
    position?: { x: number; y: number };
    scale?: { x: number; y: number };
  }) => Promise<unknown>;
  renderFrameDirectly: (time: number) => Promise<boolean>;
  playheadPosition: number;
}

export function usePreviewPointerEnd({
  refs,
  setInteractionTargetType,
  setInteractionMode,
  setActiveHandle,
  setLiveTransform,
  setCanvasSnapGuides,
  updateClipTransform,
  renderFrameDirectly,
  playheadPosition,
}: PreviewPointerEndOptions) {
  const { pendingTransformRef, interactionTargetIdRef, rafIdRef, isInteractingRef, interactionStartRef } = refs;
  return useCallback(() => {
    let transformCommit: Promise<unknown> | null = null;
    if (pendingTransformRef.current) {
      transformCommit = updateClipTransform(
        pendingTransformRef.current.clipId,
        pendingTransformRef.current.transform,
      );
      pendingTransformRef.current = null;
    }
    setInteractionTargetType(null);
    interactionTargetIdRef.current = null;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const wasInteracting = isInteractingRef.current;
    isInteractingRef.current = false;
    setInteractionMode("none");
    setActiveHandle(null);
    interactionStartRef.current = null;
    setLiveTransform(null);
    setCanvasSnapGuides({ x: null, y: null });

    if (wasInteracting) {
      if (transformCommit) {
        void transformCommit.then(() => renderFrameDirectly(playheadPosition));
      } else {
        void renderFrameDirectly(playheadPosition);
      }
    }
  }, [updateClipTransform, renderFrameDirectly, playheadPosition]);
}

interface PreviewPointerReleaseOptions {
  refs: PreviewRefs;
  interactionMode: InteractionMode;
  setInteractionMode: Dispatch<SetStateAction<InteractionMode>>;
  setActiveHandle: Dispatch<SetStateAction<HandlePosition | null>>;
  setLiveTransform: Dispatch<SetStateAction<{
    position: { x: number; y: number };
    scale: { x: number; y: number };
  } | null>>;
  renderFrameDirectly: (time: number) => Promise<boolean>;
  playheadPosition: number;
  updateClipTransform: (clipId: string, transform: {
    position?: { x: number; y: number };
    scale?: { x: number; y: number };
  }) => Promise<unknown>;
}

export function usePreviewPointerRelease({
  refs,
  interactionMode,
  setInteractionMode,
  setActiveHandle,
  setLiveTransform,
  renderFrameDirectly,
  playheadPosition,
  updateClipTransform,
}: PreviewPointerReleaseOptions): void {
  const { pendingTransformRef, rafIdRef, isInteractingRef, interactionStartRef } = refs;
  useEffect(() => {
    if (interactionMode !== "none") {
      const handleGlobalPointerEnd = () => {
        let transformCommit: Promise<unknown> | null = null;
        if (pendingTransformRef.current) {
          transformCommit = updateClipTransform(
            pendingTransformRef.current.clipId,
            pendingTransformRef.current.transform,
          );
          pendingTransformRef.current = null;
        }
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        const wasInteracting = isInteractingRef.current;
        isInteractingRef.current = false;
        setInteractionMode("none");
        setActiveHandle(null);
        interactionStartRef.current = null;
        setLiveTransform(null);

        if (wasInteracting) {
          if (transformCommit) {
            void transformCommit.then(() => renderFrameDirectly(playheadPosition));
          } else {
            void renderFrameDirectly(playheadPosition);
          }
        }
      };

      window.addEventListener("pointerup", handleGlobalPointerEnd);
      window.addEventListener("pointercancel", handleGlobalPointerEnd);
      return () => {
        window.removeEventListener("pointerup", handleGlobalPointerEnd);
        window.removeEventListener("pointercancel", handleGlobalPointerEnd);
      };
    }
  }, [interactionMode, renderFrameDirectly, playheadPosition, updateClipTransform]);
}
