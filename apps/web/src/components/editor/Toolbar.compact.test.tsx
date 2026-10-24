import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";

const mocks = vi.hoisted(() => ({
  exportState: { isExporting: false, progress: 0, phase: "", error: null as string | null, complete: false },
}));

vi.mock("../../stores/project-store", () => ({
  useProjectStore: (selector: (state: unknown) => unknown) => selector({
    project: { name: "Project A", id: "project", settings: { width: 1920, height: 1080, frameRate: 30 }, timeline: { duration: 0, tracks: [] } },
    renameProject: vi.fn(), importMedia: vi.fn(),
  }),
}));
vi.mock("../../stores/timeline-store", () => ({ useTimelineStore: (selector: (state: unknown) => unknown) => selector({ loopStart: 0, loopEnd: 0 }) }));
vi.mock("../../stores/ui-store", () => ({
  useUIStore: Object.assign((selector: (state: unknown) => unknown) => selector({ activeModal: null, closeModal: vi.fn(), setExportState: vi.fn(), panels: { agentChat: { visible: false } } }), {
    getState: () => ({ openModal: vi.fn(), setPanelVisible: vi.fn() }),
  }),
}));
vi.mock("../../hooks/useAnalytics", () => ({ useAnalytics: () => ({ track: vi.fn() }), AnalyticsEvents: { PROJECT_EXPORTED: "project_exported" } }));
vi.mock("../../services/export-runner", () => ({
  useExportRunner: () => ({ state: mocks.exportState, runExport: vi.fn(), runAudioExport: vi.fn(), showSavePicker: vi.fn(), markComplete: vi.fn(), beginExport: vi.fn(), finishExportSoon: vi.fn(), failExport: vi.fn(), cancel: vi.fn(), resetError: vi.fn() }),
  extForFormat: vi.fn(), exportFilename: vi.fn(),
}));
vi.mock("@openreel/core", () => ({ getDeviceProfile: vi.fn(), estimateExportTime: vi.fn(), trackHasAudioItems: () => false }));
vi.mock("./ExportDialog", () => ({ ExportDialog: () => null }));
vi.mock("./CompressDialog", () => ({ CompressDialog: () => null }));
vi.mock("./ScreenRecorder", () => ({ ScreenRecorder: () => null }));
vi.mock("./inspector/HistoryPanel", () => ({ HistoryPanel: () => null }));
vi.mock("./ProjectSwitcher", () => ({ ProjectSwitcher: ({ compact }: { compact?: boolean }) => <button>{compact ? "Project" : "Project A"}</button> }));
vi.mock("./settings/SettingsDialog", () => ({ SettingsDialog: () => null }));
vi.mock("../../stores/notification-store", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@openreel/ui", () => ({
  ToolcraftDropdownMenu: ({ button, children }: { button: { label: string }; children: React.ReactNode }) => <div><button>{button.label}</button>{children}</div>,
  ToolcraftDropdownMenuItem: ({ label }: { label: React.ReactNode }) => <button>{label}</button>,
  ToolcraftIconButton: ({ label }: { label: string }) => <button>{label}</button>,
  ToolcraftText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ToolcraftTextInputControl: () => <input aria-label="Project name" />,
}));

afterEach(() => { cleanup(); mocks.exportState = { isExporting: false, progress: 0, phase: "", error: null, complete: false }; });

describe("Toolbar compact layout", () => {
  it("keeps desktop editing mode and export controls without compact tabs", () => {
    render(<Toolbar />);
    expect(screen.getByRole("button", { name: "Manual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI editing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("moves compact tabs, project and export menu into the bottom bar", () => {
    render(<Toolbar compactTabs={<nav aria-label="Editor workspace"><button>Timeline</button></nav>} />);
    const header = screen.getByRole("banner");
    expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI editing" })).not.toBeInTheDocument();
    expect(header).toHaveClass("order-last");
    expect(header).toContainElement(screen.getByRole("navigation", { name: "Editor workspace" }));
    expect(screen.getByRole("button", { name: "Project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("shows export progress in place of the compact menu trigger", () => {
    mocks.exportState = { isExporting: true, progress: 42, phase: "rendering", error: null, complete: false };
    render(<Toolbar compactTabs={<nav aria-label="Editor workspace"><button>Timeline</button></nav>} />);
    expect(screen.getByRole("button", { name: /42%/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
  });
});
