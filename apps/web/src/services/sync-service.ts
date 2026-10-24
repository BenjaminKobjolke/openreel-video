import type { Project } from "@openreel/core";
import { useSettingsStore } from "../stores/settings-store";
import { useProjectStore } from "../stores/project-store";
import { toast } from "../stores/notification-store";
import { autoSaveManager } from "./auto-save";
import { loadMediaBlob, loadMediaRecord, saveMediaBlob } from "./media-storage";
import { parseTransferredProject, serializeProjectForTransfer } from "./project-package";

// Talks to apps/sync-server. One device edits at a time: every push sends the
// server version it was based on, and the server answers 409 when another
// device pushed in between.

export interface ServerProject {
  id: string;
  name: string;
  modifiedAt: number;
  version: number;
}

export class SyncConflictError extends Error {
  constructor() {
    super("A newer version from another device is on the server.");
    this.name = "SyncConflictError";
  }
}

const VERSIONS_KEY = "openreel-sync-versions";
const AUTO_PUSH_DELAY_MS = 3000;

/** Media already known to exist on the server this session ("projectId/mediaId"). */
const uploadedMedia = new Set<string>();
/** Projects whose auto push stopped after a 409, until the user saves or opens again. */
const conflicted = new Set<string>();

function readVersions(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeVersion(projectId: string, version: number): void {
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify({ ...readVersions(), [projectId]: version }));
  } catch {
    // Without storage the next push sends version 0 and gets a 409; the user can still force-save.
  }
}

export function isLinkedProject(projectId: string): boolean {
  return projectId in readVersions();
}

function serverConfig(): { base: string; token: string } | null {
  const { syncServerUrl, syncToken } = useSettingsStore.getState();
  const base = (syncServerUrl || (location.protocol.startsWith("http") ? location.origin : "")).replace(/\/+$/, "");
  return base && syncToken ? { base, token: syncToken } : null;
}

export function isSyncConfigured(): boolean {
  return serverConfig() !== null;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const config = serverConfig();
  if (!config) throw new Error("Set the sync server and token in Settings → Sync.");
  const response = await fetch(`${config.base}/api${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${config.token}` },
  });
  if (response.status === 401) throw new Error("The sync server rejected the token.");
  return response;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init);
  if (!response.ok) throw new Error(`Sync server error ${response.status}`);
  return (await response.json()) as T;
}

export function listServerProjects(): Promise<ServerProject[]> {
  return requestJson<ServerProject[]>("/projects");
}

/** The server entry when another device pushed this linked project since this device last synced it. */
export async function findNewerServerVersion(projectId: string): Promise<ServerProject | null> {
  if (!isSyncConfigured() || !isLinkedProject(projectId)) return null;
  const entry = (await listServerProjects()).find((project) => project.id === projectId);
  return entry && entry.version > (readVersions()[projectId] ?? 0) ? entry : null;
}

async function resolveMediaBlob(item: Project["mediaLibrary"]["items"][number]): Promise<Blob | null> {
  if (item.blob instanceof Blob) return item.blob;
  if (item.fileHandle && typeof item.fileHandle.getFile === "function") {
    try {
      return await item.fileHandle.getFile();
    } catch {
      // Permission lost; fall back to the stored copy.
    }
  }
  return loadMediaBlob(item.id);
}

/** Uploads missing media, then the project. Returns names of media that could not be uploaded. */
export async function pushProject(project: Project, force = false): Promise<{ missing: string[] }> {
  const missing: string[] = [];
  for (const item of project.mediaLibrary.items) {
    const key = `${project.id}/${item.id}`;
    if (uploadedMedia.has(key)) continue;
    const path = `/projects/${encodeURIComponent(project.id)}/media/${encodeURIComponent(item.id)}`;
    const head = await request(path, { method: "HEAD" });
    if (!head.ok) {
      const blob = await resolveMediaBlob(item);
      if (!blob || blob.size === 0) {
        missing.push(item.name);
        continue;
      }
      const put = await request(path, {
        method: "PUT",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      });
      if (!put.ok) throw new Error(`Uploading ${item.name} failed (${put.status}).`);
    }
    uploadedMedia.add(key);
  }

  const response = await request(`/projects/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: project.name,
      projectJson: serializeProjectForTransfer(project),
      baseVersion: readVersions()[project.id] ?? 0,
      force,
    }),
  });
  if (response.status === 409) throw new SyncConflictError();
  if (!response.ok) throw new Error(`Sync server error ${response.status}`);
  const { version } = (await response.json()) as { version: number };
  writeVersion(project.id, version);
  conflicted.delete(project.id);
  return { missing };
}

/** Downloads a server project and its missing media, then opens it with the same project id. */
export async function pullProject(projectId: string): Promise<void> {
  const { projectJson, version } = await requestJson<{ projectJson: string; version: number }>(
    `/projects/${encodeURIComponent(projectId)}`,
  );
  const project = parseTransferredProject(projectJson);

  for (const item of project.mediaLibrary.items) {
    if (await loadMediaRecord(item.id)) continue;
    const response = await request(
      `/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(item.id)}`,
    );
    if (!response.ok) continue; // opens as missing media, like a backup without it
    await saveMediaBlob(project.id, item.id, await response.blob(), item.metadata);
    uploadedMedia.add(`${project.id}/${item.id}`);
  }

  const store = useProjectStore.getState();
  if (store.hasOpenProject) await autoSaveManager.forceSave(store.getFullProject());
  // Open through the normal recent-project path so media is restored the same way.
  await autoSaveManager.forceSave(project);
  const [save] = await autoSaveManager.checkForRecovery(project.id);
  if (!save || !(await useProjectStore.getState().recoverFromAutoSave(save.id))) {
    throw new Error("The server project could not be opened.");
  }
  writeVersion(project.id, version);
  conflicted.delete(project.id);
}

function reportPushError(error: unknown, projectId: string): void {
  if (error instanceof SyncConflictError) {
    conflicted.add(projectId);
    toast.warning(
      "Not saved to server",
      "A newer version from another device is on the server. Open it from Server projects, or use Save to server to overwrite it.",
    );
    return;
  }
  toast.error("Sync failed", error instanceof Error ? error.message : String(error));
}

/** Manual "Save to server": links the project and overwrites the server copy. */
export async function saveCurrentProjectToServer(): Promise<void> {
  const project = useProjectStore.getState().getFullProject();
  try {
    const { missing } = await pushProject(project, true);
    if (missing.length > 0) {
      toast.warning("Saved without some media", `Missing locally: ${missing.join(", ")}`);
    } else {
      toast.success("Saved to server", project.name);
    }
  } catch (error) {
    reportPushError(error, project.id);
  }
}

let autoPushStarted = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastPushFailed = false;

/** Pushes linked projects a few seconds after each auto-save (also covers the agent's save_project). */
export function startSyncAutoPush(): void {
  if (autoPushStarted) return;
  autoPushStarted = true;
  autoSaveManager.on("saved", (data) => {
    const { projectId } = data as { projectId: string };
    if (!isSyncConfigured() || !isLinkedProject(projectId) || conflicted.has(projectId)) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const state = useProjectStore.getState();
      if (state.project.id !== projectId) return;
      pushProject(state.getFullProject())
        .then(() => {
          lastPushFailed = false;
        })
        .catch((error: unknown) => {
          // Only toast the first of a run of network failures, not every auto-save.
          if (!(error instanceof SyncConflictError) && lastPushFailed) return;
          lastPushFailed = !(error instanceof SyncConflictError);
          reportPushError(error, projectId);
        });
    }, AUTO_PUSH_DELAY_MS);
  });
}
