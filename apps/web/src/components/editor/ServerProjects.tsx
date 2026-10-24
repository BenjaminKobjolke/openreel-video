import React, { useEffect, useState } from "react";
import { Cloud } from "@/icons/lucide-compat";
import { ToolcraftClickableCard as ClickableCard } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { toast } from "../../stores/notification-store";
import {
  isSyncConfigured,
  listServerProjects,
  pullProject,
  type ServerProject,
} from "../../services/sync-service";

interface ServerProjectsProps {
  /** Called after a server project was opened. */
  onOpened?: () => void;
}

/** Lists projects on the sync server; renders nothing when sync is not configured. */
export const ServerProjects: React.FC<ServerProjectsProps> = ({ onOpened }) => {
  const [projects, setProjects] = useState<ServerProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const configured = isSyncConfigured();

  useEffect(() => {
    if (!configured) return;
    let active = true;
    listServerProjects()
      .then((list) => active && setProjects(list))
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      active = false;
    };
  }, [configured]);

  if (!configured) return null;

  const open = async (project: ServerProject) => {
    setOpeningId(project.id);
    try {
      await pullProject(project.id);
      onOpened?.();
    } catch (cause) {
      toast.error("Could not open server project", cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-1">
        <Cloud className="h-3 w-3" aria-hidden />
        <Text type="supporting" color="secondary" className="text-xs font-medium uppercase tracking-wider">
          Server projects
        </Text>
      </div>
      {error ? (
        <Text type="supporting" color="secondary" display="block" className="px-1 text-xs">
          {error}
        </Text>
      ) : projects === null ? (
        <Text type="supporting" color="secondary" display="block" className="px-1 text-xs">
          Loading…
        </Text>
      ) : projects.length === 0 ? (
        <Text type="supporting" color="secondary" display="block" className="px-1 text-xs">
          No projects on the server yet.
        </Text>
      ) : (
        projects.map((project) => (
          <ClickableCard
            key={project.id}
            label={`Open ${project.name} from server`}
            onClick={() => open(project)}
            isDisabled={openingId !== null}
            padding={3}
            variant="transparent"
            className="flex w-full items-center gap-3 text-left hover:bg-background-secondary"
          >
            <Cloud className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1 space-y-0.5">
              <Text type="supporting" color="primary" display="block" className="truncate text-sm font-medium">
                {project.name}
              </Text>
              <Text type="supporting" color="secondary" display="block" className="text-xs leading-4">
                {openingId === project.id ? "Opening…" : new Date(project.modifiedAt).toLocaleString()}
              </Text>
            </div>
          </ClickableCard>
        ))
      )}
    </div>
  );
};
