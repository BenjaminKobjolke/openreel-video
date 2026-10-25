import React, { useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { getClipLocalTime, type Transform } from "@openreel/core";
import { useCustomFonts } from "./inspector/font-options";
import { getTabIdsForClipType, type InspectorClipType } from "./inspector/clip-tabs.config";
import { InspectorClipHeader } from "./inspector/shell/InspectorClipHeader";
import { InspectorGroupNav } from "./inspector/shell/InspectorGroupNav";
import { getAnimatedTransform } from "./preview/canvas-renderers";
import { InspectorClipTabs } from "./inspector/InspectorClipTabs";
import { useInspectorSelection } from "./inspector/useInspectorSelection";
import { useChromaKeyControls } from "./inspector/useChromaKeyControls";
import { useInspectorClipActions } from "./inspector/useInspectorClipActions";
import { useSubtitleImport } from "./inspector/useSubtitleImport";
import { useRecipeControls } from "./inspector/useRecipeControls";

export const InspectorPanel: React.FC = () => {
  const storeActions = useProjectStore(useShallow((state) => ({
    updateClipTransition: state.updateClipTransition,
    removeClipTransition: state.removeClipTransition,
    updateSubtitle: state.updateSubtitle,
    getEditingTemplate: state.getEditingTemplate,
    removeEditingTemplateApplication: state.removeEditingTemplateApplication,
  })));
  const playheadPosition = useTimelineStore((state) => state.playheadPosition);
  const selection = useInspectorSelection();
  const { project, selectedClipIds, selectedSubtitle, selectedTimelineClip, selectedClip } = selection;
  const customFonts = useCustomFonts();
  const recipeControls = useRecipeControls(project.id, selectedClipIds, selectedTimelineClip);
  const subtitleImport = useSubtitleImport(selectedTimelineClip, selectedSubtitle);
  const chromaControls = useChromaKeyControls(selectedClip);
  const clipActions = useInspectorClipActions(selectedClip, chromaControls.forceUpdate);

  const clipId = chromaControls.clipId;
  const defaultTransform: Transform = {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
    anchor: { x: 0.5, y: 0.5 },
    borderRadius: 0,
  };
  const transform = selectedTimelineClip?.keyframes?.length
    ? getAnimatedTransform(
        selectedTimelineClip.transform,
        selectedTimelineClip.keyframes,
        getClipLocalTime(selectedTimelineClip, playheadPosition),
      )
    : selectedClip?.transform || defaultTransform;

  const clipType = useMemo(() => {
    if (!selectedClip) return null;
    if (selectedClip.mediaId.startsWith("text-")) return "text";
    if (selectedClip.mediaId.startsWith("shape-")) return "shape";
    if (selectedClip.mediaId.startsWith("svg-")) return "svg";
    if (
      selectedClip.mediaId.startsWith("sticker-") ||
      selectedClip.mediaId.startsWith("emoji-")
    ) return "sticker";

    const mediaItem = project.mediaLibrary.items.find(
      (item) => item.id === selectedClip.mediaId,
    );
    if (mediaItem?.type === "audio") return "audio";
    if (mediaItem?.type === "image") return "image";
    return "video";
  }, [selectedClip, project.mediaLibrary.items]);

  const tabIds = useMemo(
    () => getTabIdsForClipType(clipType as InspectorClipType | null),
    [clipType],
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      data-tour="inspector"
      className="w-full min-w-0 bg-bg-1 flex flex-col h-full overflow-hidden"
    >
      {selectedClip && tabIds.length > 0 && (
        <InspectorClipHeader
          name={
            project.mediaLibrary.items.find(
              (item) => item.id === selectedClip.mediaId,
            )?.name ??
            (clipType
              ? clipType.charAt(0).toUpperCase() + clipType.slice(1)
              : "Clip")
          }
          durationSeconds={selectedClip.duration}
          typeLabel={clipType ?? "clip"}
        />
      )}
      {selectedClip && selectedClipIds.length === 1 && tabIds.length > 0 && (
        <InspectorGroupNav
          key={clipId}
          tabIds={tabIds}
          clipId={clipId}
          containerRef={scrollRef}
        />
      )}
      <InspectorClipTabs
        scrollRef={scrollRef}
        selection={selection}
        actions={clipActions}
        chromaControls={chromaControls}
        subtitleImport={subtitleImport}
        recipeControls={recipeControls}
        customFonts={customFonts}
        clipId={clipId}
        clipType={clipType}
        tabIds={tabIds}
        transform={transform}
        storeActions={storeActions}
      />
    </div>
  );
};

export default InspectorPanel;
