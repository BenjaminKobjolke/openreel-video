import React from "react";
import { ToolcraftButton as Button } from "@openreel/ui";
import { Proportions, ZoomIn } from "@/icons/lucide-compat";
import { aspectLabelFor, ASPECT_PRESETS } from "./preview-aspect";
import { PREVIEW_QUALITY_OPTIONS } from "./index";
import type { PreviewControlBarProps } from "./PreviewControlBar";

type PreviewControlMenusProps = Pick<PreviewControlBarProps,
  | "settings"
  | "showAspectMenu"
  | "setShowAspectMenu"
  | "updateSettings"
  | "playbackQuality"
  | "setPlaybackQuality"
  | "showQualityMenu"
  | "setShowQualityMenu"
  | "showZoomMenu"
  | "setShowZoomMenu"
  | "zoomLevel"
  | "setZoomLevel"
  | "zoomOptions"
>;

export const PreviewControlMenus: React.FC<PreviewControlMenusProps> = (props) => {
  const {
    settings, showAspectMenu, setShowAspectMenu, updateSettings, playbackQuality,
    setPlaybackQuality, showQualityMenu, setShowQualityMenu, showZoomMenu,
    setShowZoomMenu, zoomLevel, setZoomLevel, zoomOptions,
  } = props;
  return (
    <>
          {/* Aspect ratio (project canvas size) */}
          <div className="relative">
            <Button
              label="Aspect ratio"
              variant="ghost"
              onClick={() => setShowAspectMenu(!showAspectMenu)}
              className="flex items-center gap-1.5 rounded-[7px] bg-bg-2 px-[11px] py-[7px] text-[12px] font-medium text-fg-2 hover:bg-bg-3 hover:text-fg transition-colors"
            >
              <div className="flex items-center gap-1">
                <Proportions size={12} />
                <span>{aspectLabelFor(settings.width, settings.height)}</span>
              </div>
            </Button>
            {showAspectMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowAspectMenu(false)}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-elev border border-border rounded-md shadow-md py-1 z-50 min-w-[120px]">
                  {ASPECT_PRESETS.map((opt) => {
                    const isActive =
                      settings.width === opt.width &&
                      settings.height === opt.height;
                    return (
                      <Button
                        key={opt.label}
                        label={`${opt.label} ${opt.width} by ${opt.height}`}
                        variant="ghost"
                        onClick={() => {
                          void updateSettings({
                            width: opt.width,
                            height: opt.height,
                          });
                          setShowAspectMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-[11px] font-mono text-left hover:bg-hover transition-colors flex items-center justify-between gap-3 ${
                          isActive ? "text-accent" : "text-fg-2"
                        }`}
                        >
                        <span>{opt.label}</span>
                        <span className="text-fg-3 text-[10px]">
                          {opt.width}×{opt.height}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Playback Quality (render resolution) */}
          <div className="relative">
            <Button
              label="Playback quality"
              variant="ghost"
              onClick={() => setShowQualityMenu(!showQualityMenu)}
              className="rounded-[7px] bg-bg-2 px-[11px] py-[7px] text-[12px] font-medium text-fg-2 hover:bg-bg-3 hover:text-fg transition-colors"
            >
              {PREVIEW_QUALITY_OPTIONS.find((o) => o.value === playbackQuality)
                ?.label ?? "Auto"}
            </Button>
            {showQualityMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowQualityMenu(false)}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-elev border border-border rounded-md shadow-md py-1 z-50 min-w-[80px]">
                  {PREVIEW_QUALITY_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      label={opt.label}
                      variant="ghost"
                      onClick={() => {
                        setPlaybackQuality(opt.value);
                        setShowQualityMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-[11px] font-mono text-left hover:bg-hover transition-colors ${
                        playbackQuality === opt.value
                          ? "text-accent"
                          : "text-fg-2"
                      }`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Zoom Control */}
          <div className="relative">
            <Button
              label="Preview Zoom"
              variant="ghost"
              onClick={() => setShowZoomMenu(!showZoomMenu)}
              className="flex items-center gap-1.5 rounded-[7px] bg-bg-2 px-[11px] py-[7px] text-[12px] font-medium text-fg-2 hover:bg-bg-3 hover:text-fg transition-colors"
            >
              <div className="flex items-center gap-1">
                <ZoomIn size={12} />
                <span>{Math.round(zoomLevel * 100)}%</span>
              </div>
            </Button>
            {showZoomMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowZoomMenu(false)}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-bg-elev border border-border rounded-md shadow-md py-1 z-50 min-w-[80px]">
                  {zoomOptions.map((opt) => (
                    <Button
                      key={opt.value}
                      label={opt.label}
                      variant="ghost"
                      onClick={() => {
                        setZoomLevel(opt.value);
                        setShowZoomMenu(false);
                      }}
                      className={`w-full px-3 py-1.5 text-[11px] font-mono text-left hover:bg-hover transition-colors ${
                        zoomLevel === opt.value
                          ? "text-accent"
                          : "text-fg-2"
                      }`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>


    </>
  );
};
