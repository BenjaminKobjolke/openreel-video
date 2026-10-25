import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import { useEngineStore } from "../../../stores/engine-store";

export function useInspectorSelection() {
  const { getClip, getClipTransition, getSubtitle } = useProjectStore(useShallow((state) => ({
    getClip: state.getClip,
    getClipTransition: state.getClipTransition,
    getSubtitle: state.getSubtitle,
  })));
  const project = useProjectStore((state) => state.project);
  const selectedItems = useUIStore((state) => state.selectedItems);
  const getTitleEngine = useEngineStore((state) => state.getTitleEngine);
  const getGraphicsEngine = useEngineStore((state) => state.getGraphicsEngine);

  const selectedClipIds = useMemo(() => selectedItems.filter((item) =>
    item.type === "clip" || item.type === "text-clip" || item.type === "shape-clip",
  ).map((item) => item.id), [selectedItems]);

  const selectedSubtitleId = useMemo(() => {
    const subtitleSelection = selectedItems.find(
      (item) => item.type === "subtitle",
    );
    return subtitleSelection?.id || null;
  }, [selectedItems]);

  const selectedSubtitle = selectedSubtitleId
    ? getSubtitle(selectedSubtitleId) || null
    : null;

  const selectedTransitionId = useMemo(() => {
    return selectedItems.find((item) => item.type === "transition")?.id ?? null;
  }, [selectedItems]);

  const selectedTransition = selectedTransitionId
    ? getClipTransition(selectedTransitionId) ?? null
    : null;
  const transitionClipA = selectedTransition
    ? getClip(selectedTransition.clipAId) ?? null
    : null;
  const transitionClipB = selectedTransition?.clipBId
    ? getClip(selectedTransition.clipBId) ?? null
    : null;

  const selectedTimelineClip = selectedClipIds.length === 1
    ? getClip(selectedClipIds[0]) || null
    : null;

  const selectedClip = (() => {
    if (selectedClipIds.length !== 1) return null;
    const clipId = selectedClipIds[0];
    const titleEngine = getTitleEngine();
    const textClip = titleEngine?.getTextClip(clipId);
    if (textClip) {
      return {
        id: textClip.id,
        mediaId: `text-${textClip.id}`,
        startTime: textClip.startTime,
        duration: textClip.duration,
        inPoint: 0,
        outPoint: textClip.duration,
        transform: textClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        text: textClip.text,
        trackId: textClip.trackId,
      };
    }
    const graphicsEngine = getGraphicsEngine();
    const shapeClip = graphicsEngine?.getShapeClip(clipId);
    if (shapeClip) {
      return {
        id: shapeClip.id,
        mediaId: `shape-${shapeClip.id}`,
        startTime: shapeClip.startTime,
        duration: shapeClip.duration,
        inPoint: 0,
        outPoint: shapeClip.duration,
        transform: shapeClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        shapeType: shapeClip.shapeType,
        trackId: shapeClip.trackId,
      };
    }
    const svgClip = graphicsEngine?.getSVGClip(clipId);
    if (svgClip) {
      return {
        id: svgClip.id,
        mediaId: `svg-${svgClip.id}`,
        startTime: svgClip.startTime,
        duration: svgClip.duration,
        inPoint: 0,
        outPoint: svgClip.duration,
        transform: svgClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        svgContent: svgClip.svgContent,
        trackId: svgClip.trackId,
      };
    }
    const stickerClip = graphicsEngine?.getStickerClip(clipId);
    if (stickerClip) {
      return {
        id: stickerClip.id,
        mediaId: `sticker-${stickerClip.id}`,
        startTime: stickerClip.startTime,
        duration: stickerClip.duration,
        inPoint: 0,
        outPoint: stickerClip.duration,
        transform: stickerClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        imageUrl: stickerClip.imageUrl,
        trackId: stickerClip.trackId,
      };
    }
    return getClip(clipId) ?? null;
  })();

  return {
    project,
    selectedClipIds,
    selectedSubtitle,
    selectedTransition,
    transitionClipA,
    transitionClipB,
    selectedTimelineClip,
    selectedClip,
    getTitleEngine,
    getGraphicsEngine,
  };
}
