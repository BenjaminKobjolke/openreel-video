import { useCallback } from "react";
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import type { ShapeClip, StickerClip, SVGClip, TextClip } from "@openreel/core";
import type { PreviewClip, PreviewRefs } from "./preview-runtime-types";
import type { ClipTransform, HandlePosition, InteractionMode } from "./types";
import type { snapCanvasPosition as SnapCanvasPosition } from "./canvas-snapping";

type DisplayBounds = { width: number; height: number; displayScale: number } | null;
type PreviewShape = ShapeClip | SVGClip | StickerClip;
interface PreviewPointerMoveOptions {
  refs: PreviewRefs;
  interactionMode: InteractionMode;
  activeHandle: HandlePosition | null;
  interactionTargetType: "clip" | "text-clip" | "shape-clip" | null;
  selectedClip: PreviewClip | null;
  clipAtPlayhead: PreviewClip | null;
  activeTextClip: TextClip | null;
  activeShapeClip: PreviewShape | null;
  clipBounds: DisplayBounds;
  textClipBounds: DisplayBounds;
  shapeClipBounds: DisplayBounds;
  settings: { width: number; height: number };
  canvasSnappingEnabled: boolean;
  lockAspectRatio: boolean;
  setInteractionMode: Dispatch<SetStateAction<InteractionMode>>;
  setActiveHandle: Dispatch<SetStateAction<HandlePosition | null>>;
  setInteractionTargetType: Dispatch<SetStateAction<"clip" | "text-clip" | "shape-clip" | null>>;
  setLiveTransform: Dispatch<SetStateAction<{ position: { x: number; y: number }; scale: { x: number; y: number } } | null>>;
  setCanvasSnapGuides: (guides: { x: number | null; y: number | null }) => void;
  updateClipTransform: (clipId: string, transform: Partial<ClipTransform>) => Promise<unknown>;
  updateTextTransform: (clipId: string, transform: Partial<ClipTransform>) => unknown;
  updateShapeTransform: (clipId: string, transform: Partial<ClipTransform>) => unknown;
  snapCanvasPosition: typeof SnapCanvasPosition;
  STORE_UPDATE_THROTTLE_MS: number;
}

export function usePreviewPointerMove(options: PreviewPointerMoveOptions) {
  const { refs, interactionMode, activeHandle, interactionTargetType, selectedClip, clipAtPlayhead,
    activeTextClip, activeShapeClip, clipBounds, textClipBounds, shapeClipBounds, settings,
    canvasSnappingEnabled, lockAspectRatio, updateClipTransform, updateTextTransform,
    updateShapeTransform, setCanvasSnapGuides, setLiveTransform, snapCanvasPosition,
    STORE_UPDATE_THROTTLE_MS } = options;
  const { interactionStartRef, interactionTargetIdRef, rafIdRef, pendingTransformRef, lastStoreUpdateRef } = refs;
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (interactionMode === "none" || !interactionStartRef.current) return;

      if (
        interactionTargetType === "text-clip" &&
        textClipBounds &&
        activeTextClip
      ) {
        const deltaX = e.clientX - interactionStartRef.current.x;
        const deltaY = e.clientY - interactionStartRef.current.y;
        const { displayScale } = textClipBounds;

        let newTransform: {
          position?: { x: number; y: number };
          scale?: { x: number; y: number };
        } = {};

        if (interactionMode === "move") {
          const rawX =
            interactionStartRef.current.transform.x +
            deltaX / displayScale / settings.width;
          const rawY =
            interactionStartRef.current.transform.y +
            deltaY / displayScale / settings.height;
          const halfWidth =
            textClipBounds.width / displayScale / settings.width / 2;
          const halfHeight =
            textClipBounds.height / displayScale / settings.height / 2;
          const snapped = snapCanvasPosition({
            x: rawX,
            y: rawY,
            xCandidates: [
              { value: halfWidth, guide: 0 },
              { value: 0.5, guide: 0.5 },
              { value: 1 - halfWidth, guide: 1 },
            ],
            yCandidates: [
              { value: halfHeight, guide: 0 },
              { value: 0.5, guide: 0.5 },
              { value: 1 - halfHeight, guide: 1 },
            ],
            thresholdX: 8 / displayScale / settings.width,
            thresholdY: 8 / displayScale / settings.height,
            enabled: canvasSnappingEnabled && !e.altKey,
          });
          setCanvasSnapGuides({ x: snapped.guideX, y: snapped.guideY });
          newTransform = { position: { x: snapped.x, y: snapped.y } };
        } else if (interactionMode === "resize" && activeHandle) {
          setCanvasSnapGuides({ x: null, y: null });
          const startTransform = interactionStartRef.current.transform;
          let newScaleX = startTransform.scaleX;
          let newScaleY = startTransform.scaleY;

          const scaleDeltaX = deltaX / displayScale / 100;
          const scaleDeltaY = deltaY / displayScale / 100;

          switch (activeHandle) {
            case "e":
            case "se":
            case "ne":
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "w":
            case "sw":
            case "nw":
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "s":
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
            case "n":
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
          }

          newTransform = {
            position: { x: startTransform.x, y: startTransform.y },
            scale: { x: newScaleX, y: newScaleY },
          };
        }

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            const now = performance.now();
            if (
              now - lastStoreUpdateRef.current >= STORE_UPDATE_THROTTLE_MS &&
              interactionTargetIdRef.current
            ) {
              lastStoreUpdateRef.current = now;
              updateTextTransform(interactionTargetIdRef.current, newTransform);
            }
            rafIdRef.current = null;
          });
        }
        return;
      }

      if (
        interactionTargetType === "shape-clip" &&
        shapeClipBounds &&
        activeShapeClip
      ) {
        const deltaX = e.clientX - interactionStartRef.current.x;
        const deltaY = e.clientY - interactionStartRef.current.y;
        const { displayScale } = shapeClipBounds;

        let newTransform: {
          position?: { x: number; y: number };
          scale?: { x: number; y: number };
        } = {};

        if (interactionMode === "move") {
          const rawX =
            interactionStartRef.current.transform.x +
            deltaX / displayScale / settings.width;
          const rawY =
            interactionStartRef.current.transform.y +
            deltaY / displayScale / settings.height;
          const halfWidth =
            shapeClipBounds.width / displayScale / settings.width / 2;
          const halfHeight =
            shapeClipBounds.height / displayScale / settings.height / 2;
          const snapped = snapCanvasPosition({
            x: rawX,
            y: rawY,
            xCandidates: [
              { value: halfWidth, guide: 0 },
              { value: 0.5, guide: 0.5 },
              { value: 1 - halfWidth, guide: 1 },
            ],
            yCandidates: [
              { value: halfHeight, guide: 0 },
              { value: 0.5, guide: 0.5 },
              { value: 1 - halfHeight, guide: 1 },
            ],
            thresholdX: 8 / displayScale / settings.width,
            thresholdY: 8 / displayScale / settings.height,
            enabled: canvasSnappingEnabled && !e.altKey,
          });
          setCanvasSnapGuides({ x: snapped.guideX, y: snapped.guideY });
          newTransform = { position: { x: snapped.x, y: snapped.y } };
        } else if (interactionMode === "resize" && activeHandle) {
          setCanvasSnapGuides({ x: null, y: null });
          const startTransform = interactionStartRef.current.transform;
          let newScaleX = startTransform.scaleX;
          let newScaleY = startTransform.scaleY;

          const scaleDeltaX = deltaX / displayScale / 100;
          const scaleDeltaY = deltaY / displayScale / 100;

          switch (activeHandle) {
            case "e":
            case "se":
            case "ne":
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "w":
            case "sw":
            case "nw":
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              if (lockAspectRatio) newScaleY = newScaleX;
              break;
            case "s":
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
            case "n":
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
              if (lockAspectRatio) newScaleX = newScaleY;
              break;
          }

          newTransform = {
            position: { x: startTransform.x, y: startTransform.y },
            scale: { x: newScaleX, y: newScaleY },
          };
        }

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            const now = performance.now();
            if (
              now - lastStoreUpdateRef.current >= STORE_UPDATE_THROTTLE_MS &&
              interactionTargetIdRef.current
            ) {
              lastStoreUpdateRef.current = now;
              updateShapeTransform(
                interactionTargetIdRef.current,
                newTransform,
              );
            }
            rafIdRef.current = null;
          });
        }
        return;
      }

      if (!clipBounds) return;
      const clip = selectedClip || clipAtPlayhead;
      if (!clip) return;

      const deltaX = e.clientX - interactionStartRef.current.x;
      const deltaY = e.clientY - interactionStartRef.current.y;
      const { displayScale } = clipBounds;

      let newTransform: {
        position?: { x: number; y: number };
        scale?: { x: number; y: number };
      } = {};

      if (interactionMode === "move") {
        const rawX =
          interactionStartRef.current.transform.x + deltaX / displayScale;
        const rawY =
          interactionStartRef.current.transform.y + deltaY / displayScale;
        const halfWidth = clipBounds.width / displayScale / 2;
        const halfHeight = clipBounds.height / displayScale / 2;
        const snapped = snapCanvasPosition({
          x: rawX,
          y: rawY,
          xCandidates: [
            { value: -settings.width / 2 + halfWidth, guide: 0 },
            { value: 0, guide: 0.5 },
            { value: settings.width / 2 - halfWidth, guide: 1 },
          ],
          yCandidates: [
            { value: -settings.height / 2 + halfHeight, guide: 0 },
            { value: 0, guide: 0.5 },
            { value: settings.height / 2 - halfHeight, guide: 1 },
          ],
          thresholdX: 8 / displayScale,
          thresholdY: 8 / displayScale,
          enabled: canvasSnappingEnabled && !e.altKey,
        });
        setCanvasSnapGuides({ x: snapped.guideX, y: snapped.guideY });
        newTransform = { position: { x: snapped.x, y: snapped.y } };
      } else if (interactionMode === "resize" && activeHandle) {
        setCanvasSnapGuides({ x: null, y: null });
        const startTransform = interactionStartRef.current.transform;
        let newScaleX = startTransform.scaleX;
        let newScaleY = startTransform.scaleY;
        let newX = startTransform.x;
        let newY = startTransform.y;

        // Base dimensions match how the clip is actually rendered so resize
        // handles track the cursor regardless of fit mode.
        const baseScaleW =
          (clipBounds.width / displayScale) /
          Math.max(0.001, startTransform.scaleX);
        const baseScaleH =
          (clipBounds.height / displayScale) /
          Math.max(0.001, startTransform.scaleY);

        const scaleDeltaX = deltaX / displayScale / (baseScaleW / 2);
        const scaleDeltaY = deltaY / displayScale / (baseScaleH / 2);

        switch (activeHandle) {
          case "e":
            newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
            if (lockAspectRatio) newScaleY = newScaleX;
            break;
          case "w":
            newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
            if (lockAspectRatio) newScaleY = newScaleX;
            newX = startTransform.x + deltaX / displayScale / 2;
            break;
          case "s":
            newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            if (lockAspectRatio) newScaleX = newScaleY;
            break;
          case "n":
            newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            if (lockAspectRatio) newScaleX = newScaleY;
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
          case "se":
            if (lockAspectRatio) {
              const avgDelta = (scaleDeltaX + scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            }
            break;
          case "sw":
            if (lockAspectRatio) {
              const avgDelta = (-scaleDeltaX + scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY + scaleDeltaY);
            }
            newX = startTransform.x + deltaX / displayScale / 2;
            break;
          case "ne":
            if (lockAspectRatio) {
              const avgDelta = (scaleDeltaX - scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX + scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            }
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
          case "nw":
            if (lockAspectRatio) {
              const avgDelta = (-scaleDeltaX - scaleDeltaY) / 2;
              newScaleX = Math.max(0.1, startTransform.scaleX + avgDelta);
              newScaleY = newScaleX;
            } else {
              newScaleX = Math.max(0.1, startTransform.scaleX - scaleDeltaX);
              newScaleY = Math.max(0.1, startTransform.scaleY - scaleDeltaY);
            }
            newX = startTransform.x + deltaX / displayScale / 2;
            newY = startTransform.y + deltaY / displayScale / 2;
            break;
        }

        newTransform = {
          position: { x: newX, y: newY },
          scale: { x: newScaleX, y: newScaleY },
        };
      }

      pendingTransformRef.current = {
        clipId: clip.id,
        transform: newTransform,
      };

      const currentTransform = clip.transform || {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
      };
      setLiveTransform({
        position: newTransform.position || currentTransform.position,
        scale: newTransform.scale || currentTransform.scale,
      });

      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          const now = performance.now();
          if (
            pendingTransformRef.current &&
            now - lastStoreUpdateRef.current >= STORE_UPDATE_THROTTLE_MS
          ) {
            lastStoreUpdateRef.current = now;
            updateClipTransform(
              pendingTransformRef.current.clipId,
              pendingTransformRef.current.transform,
            );
          }
          rafIdRef.current = null;
        });
      }
    },
    [
      interactionMode,
      activeHandle,
      clipBounds,
      selectedClip,
      clipAtPlayhead,
      updateClipTransform,
      settings.width,
      settings.height,
      canvasSnappingEnabled,
      lockAspectRatio,
      interactionTargetType,
      textClipBounds,
      activeTextClip,
      updateTextTransform,
      activeShapeClip,
      shapeClipBounds,
      updateShapeTransform,
    ],
  );
  return handleMouseMove;
}
