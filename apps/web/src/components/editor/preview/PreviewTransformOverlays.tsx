import React, { type Dispatch, type SetStateAction } from "react";
import { Move } from "@/icons/lucide-compat";
import { ToolcraftButton as Button } from "@openreel/ui";
import type { ShapeClip, StickerClip, SVGClip } from "@openreel/core";
import type { HandlePosition } from "./index";

type PixelBounds = { x: number; y: number; width: number; height: number };

interface PreviewTransformOverlaysProps {
  cropMode: boolean;
  showResizeHandles: boolean;
  clipBounds: PixelBounds | null;
  handleClipMouseDown: React.PointerEventHandler<HTMLDivElement>;
  lockAspectRatio: boolean;
  setLockAspectRatio: Dispatch<SetStateAction<boolean>>;
  handleHandleMouseDown: (event: React.PointerEvent, position: HandlePosition) => void;
  showTextClipHandles: boolean;
  textClipBounds: PixelBounds | null;
  handleTextClipMouseDown: React.PointerEventHandler<HTMLDivElement>;
  handleTextHandleMouseDown: (event: React.PointerEvent, position: HandlePosition) => void;
  showShapeClipHandles: boolean;
  shapeClipBounds: PixelBounds | null;
  selectedShapeClip: ShapeClip | SVGClip | StickerClip;
  handleShapeClipMouseDown: React.PointerEventHandler<HTMLDivElement>;
  handleShapeHandleMouseDown: (event: React.PointerEvent, position: HandlePosition) => void;
  showSubtitleOverlay: boolean;
  subtitleBounds: PixelBounds | null;
}

export const PreviewTransformOverlays: React.FC<PreviewTransformOverlaysProps> = (props) => {
  const {
    cropMode, showResizeHandles, clipBounds, handleClipMouseDown, lockAspectRatio,
    setLockAspectRatio, handleHandleMouseDown, showTextClipHandles,
    textClipBounds, handleTextClipMouseDown, handleTextHandleMouseDown,
    showShapeClipHandles, shapeClipBounds, selectedShapeClip,
    handleShapeClipMouseDown, handleShapeHandleMouseDown, showSubtitleOverlay, subtitleBounds,
  } = props;

  return (
    <>
          {/* Resize/Transform Overlay */}
          {!cropMode && showResizeHandles && clipBounds && (
            <div
              className="absolute pointer-events-none touch-none"
              style={{
                left: clipBounds.x,
                top: clipBounds.y,
                width: clipBounds.width,
                height: clipBounds.height,
              }}
            >
              {/* Selection border */}
              <div className="absolute inset-0 border-2 border-primary pointer-events-none" />

              {/* Move handle (center) */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-primary/80 rounded-full flex items-center justify-center cursor-move pointer-events-auto hover:bg-primary transition-colors"
                onPointerDown={handleClipMouseDown}
                title="Drag to move"
              >
                <Move size={14} className="text-white" />
              </div>

              {/* Aspect ratio lock toggle */}
              <Button
                label={lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                variant="ghost"
                className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded pointer-events-auto transition-colors ${
                  lockAspectRatio
                    ? "bg-primary text-white"
                    : "bg-background-tertiary text-text-secondary border border-border hover:bg-background-elevated"
                }`}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
              >
                {lockAspectRatio ? "🔒 Locked" : "🔓 Free"}
              </Button>

              {/* Corner resize handles */}
              <div
                className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-nw-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "nw")}
              />
              <div
                className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-ne-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "ne")}
              />
              <div
                className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-sw-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "sw")}
              />
              <div
                className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-primary rounded-sm cursor-se-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "se")}
              />

              {/* Edge resize handles */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-2 w-6 h-4 bg-white border-2 border-primary rounded-sm cursor-n-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "n")}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-4 bg-white border-2 border-primary rounded-sm cursor-s-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "s")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-6 bg-white border-2 border-primary rounded-sm cursor-w-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "w")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-6 bg-white border-2 border-primary rounded-sm cursor-e-resize pointer-events-auto hover:bg-primary hover:border-white transition-colors"
                onPointerDown={(e) => handleHandleMouseDown(e, "e")}
              />
            </div>
          )}

          {/* Text Clip Resize/Transform Overlay */}
          {showTextClipHandles && textClipBounds && (
            <div
              className="absolute pointer-events-none touch-none"
              style={{
                left: textClipBounds.x,
                top: textClipBounds.y,
                width: textClipBounds.width,
                height: textClipBounds.height,
              }}
            >
              {/* Selection border - cyan for text clips */}
              <div className="absolute inset-0 border-2 border-cyan-500 pointer-events-none" />

              {/* Move handle (center) */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-cyan-500/80 rounded-full flex items-center justify-center cursor-move pointer-events-auto hover:bg-cyan-500 transition-colors"
                onPointerDown={handleTextClipMouseDown}
                title="Drag to move text"
              >
                <Move size={14} className="text-white" />
              </div>

              {/* Aspect ratio lock toggle */}
              <Button
                label={lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                variant="ghost"
                className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded pointer-events-auto transition-colors ${
                  lockAspectRatio
                    ? "bg-cyan-500 text-white"
                    : "bg-background-tertiary text-text-secondary border border-border hover:bg-background-elevated"
                }`}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
              >
                {lockAspectRatio ? "🔒 Locked" : "🔓 Free"}
              </Button>

              {/* Corner resize handles */}
              <div
                className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-nw-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "nw")}
              />
              <div
                className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-ne-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "ne")}
              />
              <div
                className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-sw-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "sw")}
              />
              <div
                className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-se-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "se")}
              />

              {/* Edge resize handles */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-2 w-6 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-n-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "n")}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-4 bg-white border-2 border-cyan-500 rounded-sm cursor-s-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "s")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-6 bg-white border-2 border-cyan-500 rounded-sm cursor-w-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "w")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-6 bg-white border-2 border-cyan-500 rounded-sm cursor-e-resize pointer-events-auto hover:bg-cyan-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleTextHandleMouseDown(e, "e")}
              />
            </div>
          )}

          {/* Shape Clip Resize/Transform Overlay */}
          {showShapeClipHandles && shapeClipBounds && (
            <div
              className="absolute pointer-events-none touch-none"
              style={{
                left: shapeClipBounds.x,
                top: shapeClipBounds.y,
                width: shapeClipBounds.width,
                height: shapeClipBounds.height,
              }}
            >
              {selectedShapeClip.type !== "svg" && (
                <div className="absolute inset-0 border-2 border-green-500 pointer-events-none" />
              )}

              {/* Move handle (center) */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-green-500/80 rounded-full flex items-center justify-center cursor-move pointer-events-auto hover:bg-green-500 transition-colors"
                onPointerDown={handleShapeClipMouseDown}
                title="Drag to move shape"
              >
                <Move size={14} className="text-white" />
              </div>

              {/* Aspect ratio lock toggle */}
              <Button
                label={lockAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                variant="ghost"
                className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded pointer-events-auto transition-colors ${
                  lockAspectRatio
                    ? "bg-green-500 text-white"
                    : "bg-background-tertiary text-text-secondary border border-border hover:bg-background-elevated"
                }`}
                onClick={() => setLockAspectRatio(!lockAspectRatio)}
              >
                {lockAspectRatio ? "🔒 Locked" : "🔓 Free"}
              </Button>

              {/* Corner resize handles */}
              <div
                className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-nw-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "nw")}
              />
              <div
                className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-ne-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "ne")}
              />
              <div
                className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-sw-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "sw")}
              />
              <div
                className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-green-500 rounded-sm cursor-se-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "se")}
              />

              {/* Edge resize handles */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-2 w-6 h-4 bg-white border-2 border-green-500 rounded-sm cursor-n-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "n")}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-6 h-4 bg-white border-2 border-green-500 rounded-sm cursor-s-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "s")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-6 bg-white border-2 border-green-500 rounded-sm cursor-w-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "w")}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-6 bg-white border-2 border-green-500 rounded-sm cursor-e-resize pointer-events-auto hover:bg-green-500 hover:border-white transition-colors"
                onPointerDown={(e) => handleShapeHandleMouseDown(e, "e")}
              />
            </div>
          )}

          {/* Subtitle Selection Overlay */}
          {showSubtitleOverlay && subtitleBounds && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: subtitleBounds.x,
                top: subtitleBounds.y,
                width: subtitleBounds.width,
                height: subtitleBounds.height,
              }}
            >
              {/* Selection border - yellow/orange for subtitles */}
              <div className="absolute inset-0 border-2 border-yellow-500 rounded-lg pointer-events-none animate-pulse" />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-yellow-500 rounded text-[10px] font-medium text-black whitespace-nowrap">
                Subtitle Selected - Edit in Inspector
              </div>
            </div>
          )}


    </>
  );
};
