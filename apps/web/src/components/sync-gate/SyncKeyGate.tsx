import { useEffect, useState, type ReactNode } from "react";
import {
  ToolcraftButton,
  ToolcraftText,
  ToolcraftTextInputControl,
} from "@openreel/ui";
import { useSettingsStore } from "../../stores/settings-store";
import { checkSyncKey, SYNC_KEY_STATUS, type SyncKeyStatus } from "../../services/sync-service";

const START_PAGE_TITLE = "Sync key required";
const START_PAGE_DESCRIPTION = "Connect to your sync server to open the editor.";
const SERVER_URL_LABEL = "Server URL";
const SYNC_KEY_LABEL = "Sync key";
const SERVER_URL_PLACEHOLDER = location.protocol.startsWith("http")
  ? location.origin
  : "http://localhost:5180";
const SYNC_KEY_PLACEHOLDER = "OPENREEL_SYNC_TOKEN from start-server.bat";
const CONTINUE_LABEL = "Continue";
const RETRY_LABEL = "Retry";
const CHECKING_LABEL = "Checking…";
const MISSING_SERVER_URL_MESSAGE = "Enter the sync server URL.";
const MISSING_KEY_MESSAGE = "Enter the sync key.";
const REJECTED_KEY_MESSAGE = "Wrong sync key.";
const UNREACHABLE_SERVER_MESSAGE = "Server not reachable.";

function statusMessage(status: SyncKeyStatus): string | null {
  switch (status) {
    case SYNC_KEY_STATUS.OK:
      return null;
    case SYNC_KEY_STATUS.MISSING_SERVER_URL:
      return MISSING_SERVER_URL_MESSAGE;
    case SYNC_KEY_STATUS.MISSING_KEY:
      return MISSING_KEY_MESSAGE;
    case SYNC_KEY_STATUS.REJECTED:
      return REJECTED_KEY_MESSAGE;
    case SYNC_KEY_STATUS.UNREACHABLE:
      return UNREACHABLE_SERVER_MESSAGE;
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

export function SyncKeyGate({ children }: { children: ReactNode }): React.JSX.Element {
  const { syncServerUrl, syncToken, setSyncServerUrl, setSyncToken } = useSettingsStore();
  const [hasStoredKey] = useState(Boolean(syncToken));
  const [isChecking, setIsChecking] = useState(Boolean(syncToken));
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!hasStoredKey) return;

    let isCurrent = true;
    void checkSyncKey().then((status) => {
      if (!isCurrent) return;
      if (status === SYNC_KEY_STATUS.OK) {
        setIsUnlocked(true);
      } else {
        setMessage(statusMessage(status));
      }
      setIsChecking(false);
    });

    return () => {
      isCurrent = false;
    };
  }, [hasStoredKey]);

  const continueToEditor = async () => {
    setIsSubmitting(true);
    setMessage(null);
    const status = await checkSyncKey();
    if (status === SYNC_KEY_STATUS.OK) {
      setIsUnlocked(true);
    } else {
      setMessage(statusMessage(status));
    }
    setIsSubmitting(false);
  };

  if (isUnlocked) return <>{children}</>;
  if (isChecking) return <div className="h-screen w-screen bg-bg" />;

  const actionLabel = isSubmitting
    ? CHECKING_LABEL
    : message === UNREACHABLE_SERVER_MESSAGE
      ? RETRY_LABEL
      : CONTINUE_LABEL;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-10 text-text-primary">
      <section className="w-full max-w-md space-y-6">
        <header className="space-y-2">
          <ToolcraftText as="h1" type="title" color="primary" weight="semibold">
            {START_PAGE_TITLE}
          </ToolcraftText>
          <ToolcraftText type="supporting" color="secondary" className="block">
            {START_PAGE_DESCRIPTION}
          </ToolcraftText>
        </header>
        <div className="space-y-4">
          <ToolcraftTextInputControl
            label={SERVER_URL_LABEL}
            value={syncServerUrl}
            onChange={setSyncServerUrl}
            placeholder={SERVER_URL_PLACEHOLDER}
            width="100%"
          />
          <ToolcraftTextInputControl
            label={SYNC_KEY_LABEL}
            type="password"
            value={syncToken}
            onChange={setSyncToken}
            placeholder={SYNC_KEY_PLACEHOLDER}
            width="100%"
          />
          <ToolcraftButton
            label={actionLabel}
            onClick={continueToEditor}
            isDisabled={isSubmitting}
            variant="primary"
            size="md"
          />
          {message && (
            <ToolcraftText type="supporting" color="secondary" role="status" className="block">
              {message}
            </ToolcraftText>
          )}
        </div>
      </section>
    </main>
  );
}
