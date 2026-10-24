import type { JSX } from "react";
import { useState } from "react";
import { Cloud, CloudUpload } from "@/icons/lucide-compat";
import { ToolcraftButton as Button } from "@openreel/ui";
import { ToolcraftClickableCard as ClickableCard } from "@openreel/ui";
import { ToolcraftPopover as Popover } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { saveCurrentProjectToServer } from "../../services/sync-service";
import { ServerProjects } from "../../components/editor/ServerProjects";

/** Title-bar menu: save the open project to the sync server or open a server project. */
export function DesktopSyncMenu(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      label="Sync menu"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement="below"
      alignment="end"
      className="!w-[300px] border-border bg-bg-1 p-2 shadow-xl"
      content={
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">
          <ClickableCard
            label="Save to server"
            onClick={() => {
              setIsOpen(false);
              void saveCurrentProjectToServer();
            }}
            padding={3}
            variant="transparent"
            className="flex w-full items-start gap-3 text-left hover:bg-background-secondary"
          >
            <CloudUpload className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1 space-y-0.5">
              <Text type="supporting" display="block" className="text-sm font-medium leading-5">Save to server</Text>
              <Text type="supporting" display="block" color="secondary" className="text-xs leading-4">
                Upload and keep this project in sync
              </Text>
            </div>
          </ClickableCard>
          <div className="border-t border-border pt-2">
            {isOpen && <ServerProjects onOpened={() => setIsOpen(false)} />}
          </div>
        </div>
      }
    >
      <Button label="Sync" variant="secondary" size="sm" icon={<Cloud size={15} aria-hidden />} className="mr-2" />
    </Popover>
  );
}
