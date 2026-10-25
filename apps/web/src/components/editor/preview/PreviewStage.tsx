import React, { type Dispatch, type SetStateAction } from "react";
import { CropModeView, MotionPathOverlay, ParticleRenderer } from "./index";
import { ProcessingOverlay } from "../ProcessingOverlay";
import { ExportProgressOverlay } from "../ExportProgressOverlay";
import { PreviewTransformOverlays } from "./PreviewTransformOverlays";
import type { PreviewRefs, PreviewClip } from "./preview-runtime-types";
import type { MotionPathConfig, ParticleEffect } from "@openreel/core";

interface PreviewStageProps {
  refs: PreviewRefs;
  shouldShowCropMode: boolean;
  cropClip: PreviewClip | null;
  cropVideoSrc: string | null;
  cropMediaType: React.ComponentProps<typeof CropModeView>["mediaType"];
  playheadPosition: number;
  canvasSize: { width: number; height: number };
  handleCropChange: React.ComponentProps<typeof CropModeView>["onCropChange"];
  handleCropComplete: React.ComponentProps<typeof CropModeView>["onComplete"];
  handleCropCancel: React.ComponentProps<typeof CropModeView>["onCancel"];
  interactionMode: string;
  handleMouseMove: React.PointerEventHandler<HTMLDivElement>;
  handleMouseUp: React.PointerEventHandler<HTMLDivElement>;
  isMaximized: boolean;
  isFullscreen: boolean;
  zoomLevel: number;
  isDark: boolean;
  previewFrameSize: { width: number; height: number };
  previewRes: { width: number; height: number };
  hoveredGraphicClipId: string | null;
  isPlaying: boolean;
  handleGraphicsMouseMove: React.MouseEventHandler<HTMLDivElement>;
  handleGraphicsClick: React.MouseEventHandler<HTMLDivElement>;
  setHoveredGraphicClipId: Dispatch<SetStateAction<string | null>>;
  showCompositionGrid: boolean;
  showSafeMargins: boolean;
  cropMode: boolean;
  canvasSnapGuides: { x: number | null; y: number | null };
  motionPathMode: boolean;
  motionPathConfig: MotionPathConfig | null;
  motionPathClip: PreviewClip | null;
  settings: { width: number; height: number };
  handleMotionPathPointMove: React.ComponentProps<typeof MotionPathOverlay>["onPointMove"];
  handleMotionPathPointAdd: React.ComponentProps<typeof MotionPathOverlay>["onPointAdd"];
  handleMotionPathPointRemove: React.ComponentProps<typeof MotionPathOverlay>["onPointRemove"];
  handleMotionPathControlPointMove: React.ComponentProps<typeof MotionPathOverlay>["onControlPointMove"];
  particleEffects: ParticleEffect[];
  showResizeHandles: boolean;
  clipBounds: { x: number; y: number; width: number; height: number } | null;
  handleClipMouseDown: React.PointerEventHandler<HTMLDivElement>;
  lockAspectRatio: boolean;
  setLockAspectRatio: Dispatch<SetStateAction<boolean>>;
  handleHandleMouseDown: React.ComponentProps<typeof PreviewTransformOverlays>["handleHandleMouseDown"];
  showTextClipHandles: boolean;
  textClipBounds: { x: number; y: number; width: number; height: number } | null;
  handleTextClipMouseDown: React.PointerEventHandler<HTMLDivElement>;
  handleTextHandleMouseDown: React.ComponentProps<typeof PreviewTransformOverlays>["handleTextHandleMouseDown"];
  showShapeClipHandles: boolean;
  shapeClipBounds: { x: number; y: number; width: number; height: number } | null;
  selectedShapeClip: React.ComponentProps<typeof PreviewTransformOverlays>["selectedShapeClip"];
  handleShapeClipMouseDown: React.PointerEventHandler<HTMLDivElement>;
  handleShapeHandleMouseDown: React.ComponentProps<typeof PreviewTransformOverlays>["handleShapeHandleMouseDown"];
  showSubtitleOverlay: boolean;
  subtitleBounds: { x: number; y: number; width: number; height: number } | null;
  activeGraphicClips: PreviewClip[];
  selectedShapeClipId: string | null;
  getGraphicClipDisplayBounds: (clip: PreviewClip) => { x: number; y: number; width: number; height: number } | null;
  exportState: { isExporting: boolean; progress: number; phase: string };
  videoAreaSize: { width: number; height: number };
}

export const PreviewStage: React.FC<PreviewStageProps> = (props) => {
  const {
    refs, shouldShowCropMode, cropClip, cropVideoSrc, cropMediaType, playheadPosition,
    canvasSize, handleCropChange, handleCropComplete, handleCropCancel,
    interactionMode, handleMouseMove, handleMouseUp, isMaximized, isFullscreen,
    zoomLevel, isDark, previewFrameSize, previewRes, hoveredGraphicClipId, isPlaying,
    handleGraphicsMouseMove, handleGraphicsClick, setHoveredGraphicClipId,
    showCompositionGrid, showSafeMargins, cropMode, canvasSnapGuides, motionPathMode, motionPathConfig,
    motionPathClip, settings, handleMotionPathPointMove, handleMotionPathPointAdd,
    handleMotionPathPointRemove, handleMotionPathControlPointMove, particleEffects,
    showResizeHandles, clipBounds, handleClipMouseDown, lockAspectRatio,
    setLockAspectRatio, handleHandleMouseDown, showTextClipHandles, textClipBounds,
    handleTextClipMouseDown, handleTextHandleMouseDown, showShapeClipHandles,
    shapeClipBounds, selectedShapeClip, handleShapeClipMouseDown,
    handleShapeHandleMouseDown, showSubtitleOverlay, subtitleBounds,
    activeGraphicClips, selectedShapeClipId, getGraphicClipDisplayBounds,
    exportState, videoAreaSize,
  } = props;
  const { videoAreaRef, overlayRef, canvasRef } = refs;

  return (
    <>
      {/* Crop Mode View - Full Screen Overlay */}
      {shouldShowCropMode && (
        <CropModeView
          clip={cropClip!}
          videoSrc={cropVideoSrc}
          mediaType={cropMediaType}
          currentTime={playheadPosition}
          canvasWidth={canvasSize.width}
          canvasHeight={canvasSize.height}
          onCropChange={handleCropChange}
          onComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      {/* Video Area */}
      <div
        ref={videoAreaRef}
        className={`flex-1 min-h-0 min-w-0 relative flex items-center justify-center bg-bg-1 transition-all duration-300 ${
          isMaximized || isFullscreen ? "p-0" : "p-[18px]"
        } ${zoomLevel > 1 ? "overflow-auto" : ""}`}
        onPointerMove={interactionMode !== "none" ? handleMouseMove : undefined}
        onPointerUp={handleMouseUp}
      >
        <div
          ref={overlayRef}
          className={`relative isolate bg-[var(--screen-bg)] overflow-visible transition-all duration-300 ${
            isMaximized || isFullscreen
              ? "rounded-none ring-0 shadow-none"
              : isDark
                ? "shadow-2xl rounded-[10px] ring-1 ring-border shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                : "rounded-[10px] ring-1 ring-border shadow-sm"
          }`}
          style={{
            width: `${previewFrameSize.width}px`,
            height: `${previewFrameSize.height}px`,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
          onMouseMove={!isPlaying ? handleGraphicsMouseMove : undefined}
          onClick={!isPlaying ? handleGraphicsClick : undefined}
          onMouseLeave={() => setHoveredGraphicClipId(null)}
        >
          <canvas
            ref={canvasRef}
            width={previewRes.width}
            height={previewRes.height}
            className="w-full h-full object-contain bg-[var(--screen-bg)] rounded-[10px]"
            style={{
              cursor: hoveredGraphicClipId && !isPlaying ? "pointer" : "default",
            }}
          />

          {showCompositionGrid && !cropMode ? (
            <div
              aria-label="Composition grid"
              className="pointer-events-none absolute inset-0 z-20"
            >
              {[1, 2].map((line) => (
                <React.Fragment key={line}>
                  <span
                    className="absolute inset-y-0 w-px bg-white/45 shadow-[0_0_1px_rgba(0,0,0,0.9)]"
                    style={{ left: `${(line / 3) * 100}%` }}
                  />
                  <span
                    className="absolute inset-x-0 h-px bg-white/45 shadow-[0_0_1px_rgba(0,0,0,0.9)]"
                    style={{ top: `${(line / 3) * 100}%` }}
                  />
                </React.Fragment>
              ))}
            </div>
          ) : null}

          {showSafeMargins && !cropMode ? (
            <div
              aria-label="Title and action safe margins"
              className="pointer-events-none absolute inset-0 z-20"
            >
              <span className="absolute inset-[5%] border border-dashed border-white/60 shadow-[0_0_1px_rgba(0,0,0,0.9)]" />
              <span className="absolute inset-[10%] border border-white/75 shadow-[0_0_1px_rgba(0,0,0,0.9)]" />
              <span className="absolute left-[10%] top-[10%] rounded-br bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/80">
                Title safe
              </span>
            </div>
          ) : null}

          {canvasSnapGuides.x !== null && !cropMode ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-30 w-px bg-accent shadow-[0_0_3px_var(--accent)]"
              style={{ left: `${canvasSnapGuides.x * 100}%` }}
            />
          ) : null}
          {canvasSnapGuides.y !== null && !cropMode ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 z-30 h-px bg-accent shadow-[0_0_3px_var(--accent)]"
              style={{ top: `${canvasSnapGuides.y * 100}%` }}
            />
          ) : null}

          {/* Processing Overlay */}
          <ProcessingOverlay />

          {/* Motion Path Overlay */}
          {motionPathMode && motionPathConfig && motionPathClip && (
            <div className="absolute inset-0 pointer-events-auto z-30">
              <MotionPathOverlay
                config={motionPathConfig}
                canvasWidth={settings.width}
                canvasHeight={settings.height}
                currentTime={playheadPosition - motionPathClip.startTime}
                clipDuration={motionPathClip.duration}
                onPointMove={handleMotionPathPointMove}
                onPointAdd={handleMotionPathPointAdd}
                onPointRemove={handleMotionPathPointRemove}
                onControlPointMove={handleMotionPathControlPointMove}
                disabled={isPlaying}
              />
            </div>
          )}

          {/* Particle Effects Renderer */}
          {particleEffects.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-20">
              <ParticleRenderer
                effects={particleEffects}
                width={settings.width}
                height={settings.height}
                currentTime={playheadPosition}
                isPlaying={isPlaying}
              />
            </div>
          )}

          <PreviewTransformOverlays {...{
            cropMode, showResizeHandles, clipBounds, handleClipMouseDown, lockAspectRatio,
            setLockAspectRatio, handleHandleMouseDown, showTextClipHandles,
            textClipBounds, handleTextClipMouseDown, handleTextHandleMouseDown,
            showShapeClipHandles, shapeClipBounds, selectedShapeClip: selectedShapeClip!,
            handleShapeClipMouseDown, handleShapeHandleMouseDown, showSubtitleOverlay, subtitleBounds,
          }} />
          {/* Graphic Clip Hover Indicators */}
          {!cropMode && !isPlaying &&
            activeGraphicClips.map((clip) => {
              if (clip.type === "svg") return null;
              if (clip.id === selectedShapeClipId) return null;
              if (clip.id !== hoveredGraphicClipId) return null;
              const bounds = getGraphicClipDisplayBounds(clip);
              if (!bounds) return null;
              return (
                <div
                  key={clip.id}
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: bounds.x,
                    top: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                  }}
                >
                  <div className="absolute inset-0 border-2 border-dashed border-white/80 rounded-sm" />
                  <div
                    aria-hidden="true"
                    className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/70 rounded text-[10px] text-white whitespace-nowrap"
                  >
                    Click to select
                  </div>
                </div>
              );
            })}
          </div>
      </div>


      {exportState.isExporting && <ExportProgressOverlay progress={exportState.progress} phase={exportState.phase} width={videoAreaSize.width} height={videoAreaSize.height} />}
    </>
  );
};
