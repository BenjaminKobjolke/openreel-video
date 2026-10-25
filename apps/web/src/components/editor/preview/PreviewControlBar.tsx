import React, { type Dispatch, type SetStateAction } from "react";
import { Volume2, VolumeX, Monitor, Maximize2, Minimize2, LayoutGrid, Proportions, Magnet, Repeat } from "@/icons/lucide-compat";
import { ToolcraftIconButton as IconButton } from "@openreel/ui";
import { PreviewTimecode } from "../PreviewTimecode";
import { PreviewPlaybackButtons } from "../PreviewPlaybackButtons";
import { PreviewScrubBar } from "../PreviewScrubBar";
import { getPlaybackBridge } from "../../../bridges/playback-bridge";
import { formatFrameTimecode } from "../../../utils/frame-timecode";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import { PreviewControlMenus } from "./PreviewControlMenus";

export interface PreviewControlBarProps {
  compact: boolean;
  playheadPosition: number;
  actualEndTime: number;
  settings: { frameRate: number; width: number; height: number };
  playbackLockedReason: string | null;
  isPlaying: boolean;
  handleSkipBack: () => void;
  togglePlayback: () => void;
  handleSkipForward: () => void;
  loopEnabled: boolean;
  previewLoopRange: { start: number; end: number } | null;
  handleToggleLoop: () => void;
  exportState: { isExporting: boolean; progress: number; phase: string };
  isMuted: boolean;
  setIsMuted: Dispatch<SetStateAction<boolean>>;
  showAspectMenu: boolean;
  setShowAspectMenu: Dispatch<SetStateAction<boolean>>;
  updateSettings: ReturnType<typeof useProjectStore.getState>["updateSettings"];
  playbackQuality: ReturnType<typeof useUIStore.getState>["playbackQuality"];
  setPlaybackQuality: ReturnType<typeof useUIStore.getState>["setPlaybackQuality"];
  showQualityMenu: boolean;
  setShowQualityMenu: Dispatch<SetStateAction<boolean>>;
  showZoomMenu: boolean;
  setShowZoomMenu: Dispatch<SetStateAction<boolean>>;
  zoomLevel: number;
  setZoomLevel: Dispatch<SetStateAction<number>>;
  zoomOptions: { label: string; value: number }[];
  canvasSnappingEnabled: boolean;
  setCanvasSnappingEnabled: Dispatch<SetStateAction<boolean>>;
  setCanvasSnapGuides: Dispatch<SetStateAction<{ x: number | null; y: number | null }>>;
  showCompositionGrid: boolean;
  setShowCompositionGrid: Dispatch<SetStateAction<boolean>>;
  showSafeMargins: boolean;
  setShowSafeMargins: Dispatch<SetStateAction<boolean>>;
  isFullscreen: boolean;
  handleFullscreen: () => void;
  isMaximized: boolean;
  handleMaximize: () => void;
}

export const PreviewControlBar: React.FC<PreviewControlBarProps> = (props) => {
  const {
    compact, playheadPosition, actualEndTime, settings, playbackLockedReason,
    isPlaying, handleSkipBack, togglePlayback, handleSkipForward, loopEnabled,
    previewLoopRange, handleToggleLoop, exportState, isMuted, setIsMuted,
    canvasSnappingEnabled,
    setCanvasSnappingEnabled, setCanvasSnapGuides, showCompositionGrid,
    setShowCompositionGrid, showSafeMargins, setShowSafeMargins, isFullscreen,
    handleFullscreen, isMaximized, handleMaximize,
  } = props;
  return (
    <>
      {/* Player Controls with integrated Scrub Bar */}
      <div
        className={`shrink-0 border-t border-border transition-all duration-300 ${
          isMaximized || isFullscreen
            ? "z-50 bg-bg-1 backdrop-blur-sm"
            : "z-20 bg-bg-1"
        }`}
      >
        {/* Scrub Bar - integrated at top of controls */}
        <PreviewScrubBar
          position={playheadPosition}
          duration={actualEndTime}
          onScrubStart={() => getPlaybackBridge().startScrubbing()}
          onScrub={(time) => getPlaybackBridge().scrubTo(time)}
          onScrubEnd={() => getPlaybackBridge().endScrubbing()}
        />

        {/* Controls row */}
        <div data-preview-transport className="min-h-12 px-3 py-1 flex flex-wrap items-center gap-2">
        {!compact && (
          <>
            <div data-preview-timecode className="flex items-center gap-2">
              <PreviewTimecode position={playheadPosition} duration={actualEndTime} frameRate={settings.frameRate}
                disabled={Boolean(playbackLockedReason) || exportState.isExporting} />
            </div>

            <PreviewPlaybackButtons
              isPlaying={isPlaying}
              playbackLockedReason={playbackLockedReason}
              onSkipBack={handleSkipBack}
              onTogglePlayback={togglePlayback}
              onSkipForward={handleSkipForward}
            />
          </>
        )}

        <div data-preview-tools className="flex gap-1.5 items-center">
          {compact && (
            <>
              <PreviewPlaybackButtons
                isPlaying={isPlaying}
                playbackLockedReason={playbackLockedReason}
                onSkipBack={handleSkipBack}
                onTogglePlayback={togglePlayback}
                onSkipForward={handleSkipForward}
              />
              <div data-preview-timecode className="flex items-center gap-2">
                <PreviewTimecode position={playheadPosition} duration={actualEndTime} frameRate={settings.frameRate}
                  disabled={Boolean(playbackLockedReason) || exportState.isExporting} />
              </div>
            </>
          )}
          <IconButton
            label={loopEnabled ? "Disable preview loop" : "Enable preview loop"}
            title={`Loop ${formatFrameTimecode(previewLoopRange?.start ?? 0, settings.frameRate)} to ${formatFrameTimecode(previewLoopRange?.end ?? 0, settings.frameRate)} • I: mark start • O: mark end • Shift+L: toggle`}
            icon={<Repeat size={16} />}
            aria-pressed={loopEnabled}
            variant="ghost"
            size="sm"
            onClick={handleToggleLoop}
            isDisabled={actualEndTime <= 0 || exportState.isExporting}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${loopEnabled ? "bg-accent/15 text-accent" : "bg-bg-2 text-fg-2 hover:bg-bg-3 hover:text-fg"}`}
          />
          <IconButton
            label={isMuted ? "Unmute" : "Mute"}
            icon={isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            variant="ghost"
            size="sm"
            onClick={() => setIsMuted(!isMuted)}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              isMuted
                ? "bg-bg-2 text-status-error"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />

          <PreviewControlMenus {...props} />
          <IconButton
            label="Canvas snapping"
            icon={<Magnet size={16} />}
            variant="ghost"
            size="sm"
            aria-pressed={canvasSnappingEnabled}
            onClick={() => {
              setCanvasSnappingEnabled((enabled) => !enabled);
              setCanvasSnapGuides({ x: null, y: null });
            }}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              canvasSnappingEnabled
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />
          <IconButton
            label="Composition grid"
            icon={<LayoutGrid size={16} />}
            variant="ghost"
            size="sm"
            aria-pressed={showCompositionGrid}
            onClick={() => setShowCompositionGrid((visible) => !visible)}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              showCompositionGrid
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />
          <IconButton
            label="Title and action safe margins"
            icon={<Proportions size={16} />}
            variant="ghost"
            size="sm"
            aria-pressed={showSafeMargins}
            onClick={() => setShowSafeMargins((visible) => !visible)}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              showSafeMargins
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />

          <IconButton
            label={isFullscreen ? "Exit Full Screen" : "Full Screen"}
            icon={<Monitor size={16} />}
            variant="ghost"
            size="sm"
            onClick={handleFullscreen}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              isFullscreen
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />
          <IconButton
            label={isMaximized ? "Restore Size" : "Maximize Preview"}
            icon={isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            variant="ghost"
            size="sm"
            onClick={handleMaximize}
            className={`w-[34px] h-[34px] grid place-items-center rounded-[7px] transition-colors ${
              isMaximized
                ? "bg-accent-soft text-accent"
                : "bg-bg-2 text-fg-2 hover:text-fg hover:bg-bg-3"
            }`}
          />
        </div>
      </div>
    </div>
    </>
  );
};
