import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project } from "@openreel/core";

vi.mock("../stores/project-store", () => ({ useProjectStore: { getState: vi.fn() } }));
vi.mock("./media-storage", () => ({
  loadMediaBlob: vi.fn(async () => new Blob(["stored"], { type: "video/mp4" })),
  loadMediaRecord: vi.fn(),
  saveMediaBlob: vi.fn(),
}));
vi.mock("./project-package", () => ({
  serializeProjectForTransfer: () => '{"project":true}',
  parseTransferredProject: vi.fn(),
}));

import { useSettingsStore } from "../stores/settings-store";
import {
  checkSyncKey,
  findNewerServerVersion,
  isLinkedProject,
  pushProject,
  SYNC_KEY_STATUS,
  SyncAuthError,
  SyncConflictError,
} from "./sync-service";

const project = {
  id: "proj-1",
  name: "Pasta",
  mediaLibrary: {
    items: [
      { id: "m-present", name: "a.jpg", blob: new Blob(["a"]) },
      { id: "m-missing", name: "b.mp4", blob: null, fileHandle: null },
    ],
  },
} as unknown as Project;

interface Call {
  url: string;
  method: string;
  body?: unknown;
}

function mockServer(projectStatus = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ url, method, body: init.body });
    if (method === "HEAD") return new Response(null, { status: url.endsWith("m-present") ? 200 : 404 });
    if (url.includes("/media/")) return new Response("{}", { status: 200 });
    if (projectStatus === 409) return new Response('{"version":5}', { status: 409 });
    return new Response('{"version":4}', { status: 200 });
  }));
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ syncServerUrl: "http://pc:5180/", syncToken: "tok" });
});

describe("sync-service pushProject", () => {
  it("uploads only media the server lacks and sends the base version", async () => {
    localStorage.setItem("openreel-sync-versions", JSON.stringify({ "proj-1": 3 }));
    const calls = mockServer();

    await pushProject(project);

    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts.map((c) => c.url)).toEqual([
      "http://pc:5180/api/projects/proj-1/media/m-missing",
      "http://pc:5180/api/projects/proj-1",
    ]);
    expect(JSON.parse(puts[1].body as string)).toMatchObject({ name: "Pasta", baseVersion: 3, force: false });
    expect(JSON.parse(localStorage.getItem("openreel-sync-versions")!)).toEqual({ "proj-1": 4 });
  });

  it("throws SyncConflictError on 409 and keeps the old version", async () => {
    localStorage.setItem("openreel-sync-versions", JSON.stringify({ "proj-2": 1 }));
    mockServer(409);

    await expect(pushProject({ ...project, id: "proj-2" })).rejects.toBeInstanceOf(SyncConflictError);
    expect(JSON.parse(localStorage.getItem("openreel-sync-versions")!)).toEqual({ "proj-2": 1 });
    expect(isLinkedProject("proj-2")).toBe(true);
  });
});

describe("sync-service findNewerServerVersion", () => {
  function mockList() {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify([{ id: "proj-1", name: "Pasta", modifiedAt: 1, version: 14 }]), { status: 200 }),
    ));
  }

  it("returns the server entry when another device pushed since the last sync", async () => {
    localStorage.setItem("openreel-sync-versions", JSON.stringify({ "proj-1": 12 }));
    mockList();
    expect(await findNewerServerVersion("proj-1")).toMatchObject({ version: 14 });
  });

  it("returns null when up to date or not linked", async () => {
    localStorage.setItem("openreel-sync-versions", JSON.stringify({ "proj-1": 14 }));
    mockList();
    expect(await findNewerServerVersion("proj-1")).toBeNull();
    expect(await findNewerServerVersion("other")).toBeNull();
  });
});

describe("sync-service checkSyncKey", () => {
  it("returns MISSING_SERVER_URL when the key is set but the desktop server URL is missing", async () => {
    vi.stubGlobal("location", { protocol: "file:" });
    useSettingsStore.setState({ syncServerUrl: "", syncToken: "tok" });

    expect(await checkSyncKey()).toBe(SYNC_KEY_STATUS.MISSING_SERVER_URL);
  });

  it("returns MISSING_KEY when the server URL is configured without a key", async () => {
    useSettingsStore.setState({ syncServerUrl: "http://pc:5180", syncToken: "" });

    expect(await checkSyncKey()).toBe(SYNC_KEY_STATUS.MISSING_KEY);
  });

  it("returns OK when the server accepts the configured key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));

    expect(await checkSyncKey()).toBe(SYNC_KEY_STATUS.OK);
  });

  it("returns REJECTED when the server rejects the configured key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));

    expect(await checkSyncKey()).toBe(SYNC_KEY_STATUS.REJECTED);
    await expect(pushProject(project)).rejects.toBeInstanceOf(SyncAuthError);
  });

  it("returns UNREACHABLE when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    expect(await checkSyncKey()).toBe(SYNC_KEY_STATUS.UNREACHABLE);
  });
});
