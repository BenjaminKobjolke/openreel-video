import React from "react";
import { ToolcraftText as Text } from "@openreel/ui";

interface PreviewHeaderProps {
  compact: boolean;
  isMaximized: boolean;
  isFullscreen: boolean;
}

export const PreviewHeader: React.FC<PreviewHeaderProps> = ({
  compact,
  isMaximized,
  isFullscreen,
}) => {
  if (compact || isMaximized || isFullscreen) return null;

  return (
    <div className="flex items-center px-3.5 py-2 border-b border-border bg-bg-1 gap-2.5 min-h-[38px] shrink-0">
      <Text type="label" color="primary" weight="semibold" className="text-[13px] tracking-tight text-fg m-0">Player</Text>
      <div className="ml-auto flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" title="Live preview" />
      </div>
    </div>
  );
};
