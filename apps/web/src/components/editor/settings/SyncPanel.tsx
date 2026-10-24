import React, { useState } from "react";
import { ToolcraftButton as Button } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { ToolcraftTextInputControl as TextInput } from "@openreel/ui";
import { useSettingsStore } from "../../../stores/settings-store";
import { listServerProjects } from "../../../services/sync-service";

export const SyncPanel: React.FC = () => {
  const { syncServerUrl, syncToken, setSyncServerUrl, setSyncToken } = useSettingsStore();
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const projects = await listServerProjects();
      setStatus(`Connected. ${projects.length} project${projects.length === 1 ? "" : "s"} on the server.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection failed.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background-tertiary p-3">
      <div>
        <Text type="supporting" color="secondary" className="text-sm font-medium">
          Sync server
        </Text>
        <Text type="supporting" color="secondary" className="mt-0.5 block text-xs">
          Share projects between this device and others through the OpenReel sync server on your PC.
          Linked projects upload a few seconds after each save. Only edit on one device at a time.
        </Text>
      </div>
      <TextInput
        label="Server URL"
        value={syncServerUrl}
        onChange={setSyncServerUrl}
        placeholder={location.protocol.startsWith("http") ? location.origin : "http://localhost:5180"}
        width="100%"
      />
      <TextInput
        label="Token"
        type="password"
        value={syncToken}
        onChange={setSyncToken}
        placeholder="OPENREEL_SYNC_TOKEN from start-server.bat"
        width="100%"
      />
      <div className="flex items-center gap-3">
        <Button
          label={testing ? "Testing…" : "Test connection"}
          onClick={testConnection}
          isDisabled={testing || !syncToken}
          variant="primary"
          size="md"
        />
        {status && (
          <Text type="supporting" color="secondary" className="text-xs" role="status">
            {status}
          </Text>
        )}
      </div>
    </div>
  );
};
