import React from "react";
import { ToolcraftText as Text } from "@openreel/ui";

export const InspectorEmptyState: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
    <Text type="body" weight="semibold" display="block" className="mb-1.5 text-sm text-fg">
      No selection
    </Text>
    <Text type="supporting" display="block" className="text-xs text-fg-muted">
      Select a clip to view its properties
    </Text>
  </div>
);
