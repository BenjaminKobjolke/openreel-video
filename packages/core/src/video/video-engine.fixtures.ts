// The engine import is too slow for a per-test timeout under full-suite load.
import { vi } from "vitest";

export const VIDEO_ENGINE_IMPORT_TIMEOUT_MS = 60_000;

export function stubWorkerSelf(): void {
  vi.stubGlobal("self", {
    onmessage: null,
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

export async function loadVideoEngine() {
  stubWorkerSelf();
  return (await import("./video-engine")).VideoEngine;
}
