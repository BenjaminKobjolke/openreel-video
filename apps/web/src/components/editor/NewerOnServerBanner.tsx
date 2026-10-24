import React, { useEffect, useState } from "react";
import { Cloud } from "@/icons/lucide-compat";
import { ToolcraftButton as Button } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { useProjectStore } from "../../stores/project-store";
import { toast } from "../../stores/notification-store";
import { findNewerServerVersion, pullProject, type ServerProject } from "../../services/sync-service";

/** After a linked project opens (refresh, recovery, recent), offers the newer copy another device pushed. */
export const NewerOnServerBanner: React.FC = () => {
  const projectId = useProjectStore((state) => (state.hasOpenProject ? state.project.id : null));
  const [newer, setNewer] = useState<ServerProject | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setNewer(null);
    if (!projectId) return;
    let active = true;
    findNewerServerVersion(projectId)
      .then((entry) => active && setNewer(entry))
      .catch(() => undefined); // server offline: keep editing locally
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!newer) return null;

  const load = async () => {
    setLoading(true);
    try {
      await pullProject(newer.id);
      setNewer(null);
    } catch (cause) {
      toast.error("Could not open server version", cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-[10000] flex w-[min(460px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-3 rounded-lg border border-border bg-bg-1 p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <Text type="supporting" color="primary" display="block" className="text-sm">
          A newer version of “{newer.name}” is on the server, saved {new Date(newer.modifiedAt).toLocaleString()} from
          another device.
        </Text>
      </div>
      <div className="flex justify-end gap-2">
        <Button label="Keep this copy" variant="ghost" size="sm" onClick={() => setNewer(null)} isDisabled={loading} />
        <Button
          label={loading ? "Loading…" : "Load server version"}
          variant="primary"
          size="sm"
          onClick={load}
          isDisabled={loading}
        />
      </div>
    </div>
  );
};
