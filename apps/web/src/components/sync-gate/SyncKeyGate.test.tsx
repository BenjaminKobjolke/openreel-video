import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../../stores/settings-store";
import { checkSyncKey, SYNC_KEY_STATUS } from "../../services/sync-service";
import { SyncKeyGate } from "./SyncKeyGate";

vi.mock("../../services/sync-service", () => ({
  checkSyncKey: vi.fn(),
  SYNC_KEY_STATUS: {
    OK: "OK",
    MISSING_SERVER_URL: "MISSING_SERVER_URL",
    MISSING_KEY: "MISSING_KEY",
    REJECTED: "REJECTED",
    UNREACHABLE: "UNREACHABLE",
  },
}));

beforeEach(() => {
  useSettingsStore.setState({ syncServerUrl: "", syncToken: "" });
  vi.mocked(checkSyncKey).mockReset();
});

describe("SyncKeyGate", () => {
  it("shows the start page when there is no key and keeps children hidden", () => {
    render(<SyncKeyGate><div>Editor</div></SyncKeyGate>);

    expect(screen.getByText("Sync key required")).toBeInTheDocument();
    expect(screen.queryByText("Editor")).not.toBeInTheDocument();
    expect(checkSyncKey).not.toHaveBeenCalled();
  });

  it("opens the editor after a stored key is confirmed", async () => {
    useSettingsStore.setState({ syncServerUrl: "", syncToken: "saved-key" });
    vi.mocked(checkSyncKey).mockResolvedValue(SYNC_KEY_STATUS.OK);

    render(<SyncKeyGate><div>Editor</div></SyncKeyGate>);

    expect(await screen.findByText("Editor")).toBeInTheDocument();
  });

  it("identifies the missing server URL when a stored key is present", async () => {
    useSettingsStore.setState({ syncServerUrl: "", syncToken: "saved-key" });
    vi.mocked(checkSyncKey).mockResolvedValue(SYNC_KEY_STATUS.MISSING_SERVER_URL);

    render(<SyncKeyGate><div>Editor</div></SyncKeyGate>);

    expect(await screen.findByText("Enter the sync server URL.")).toBeInTheDocument();
  });

  it("shows a wrong-key message and keeps the editor hidden", async () => {
    vi.mocked(checkSyncKey).mockResolvedValue(SYNC_KEY_STATUS.REJECTED);
    render(<SyncKeyGate><div>Editor</div></SyncKeyGate>);
    fireEvent.change(screen.getByLabelText("Sync key"), { target: { value: "wrong-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Wrong sync key.")).toBeInTheDocument();
    expect(screen.queryByText("Editor")).not.toBeInTheDocument();
  });

  it("offers Retry after an unreachable server and opens after Retry succeeds", async () => {
    vi.mocked(checkSyncKey)
      .mockResolvedValueOnce(SYNC_KEY_STATUS.UNREACHABLE)
      .mockResolvedValueOnce(SYNC_KEY_STATUS.OK);
    render(<SyncKeyGate><div>Editor</div></SyncKeyGate>);
    fireEvent.change(screen.getByLabelText("Sync key"), { target: { value: "valid-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Server not reachable.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Editor")).toBeInTheDocument());
  });
});
