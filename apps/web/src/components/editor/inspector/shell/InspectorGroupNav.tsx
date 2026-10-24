import * as React from "react";
import { useState } from "react";
import { useInspectorNavigationStore } from "../../../../stores/inspector-navigation-store";
import { TAB_DEFS, type InspectorTabId } from "../clip-tabs.config";
import { InspectorTabs } from "./InspectorTabs";

/** Jump bar that opens the first section of an inspector group. */
export interface InspectorGroupNavProps {
  tabIds: InspectorTabId[];
  clipId: string;
  containerRef: React.RefObject<HTMLElement | null>;
}

export const InspectorGroupNav: React.FC<InspectorGroupNavProps> = ({
  tabIds,
  clipId,
  containerRef,
}) => {
  const [activeId, setActiveId] = useState<InspectorTabId>(tabIds[0] ?? "transform");

  const jump = (id: InspectorTabId) => {
    setActiveId(id);
    const sectionId = containerRef.current
      ?.querySelector<HTMLElement>(`[data-inspector-group="${id}"] [data-section-id]`)
      ?.getAttribute("data-section-id");
    if (sectionId) {
      useInspectorNavigationStore.getState().requestSection(sectionId, clipId);
    }
  };

  return (
    <InspectorTabs
      tabs={tabIds.map((id) => TAB_DEFS[id])}
      activeId={activeId}
      onSelect={jump}
    />
  );
};
