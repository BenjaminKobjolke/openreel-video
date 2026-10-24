import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSyncServer, type RunningSyncServer } from "./server.ts";

const TOKEN = "secret-token";
const auth = { Authorization: `Bearer ${TOKEN}` };

let running: RunningSyncServer;
let base: string;
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "openreel-sync-"));
  const webDist = join(root, "web");
  await mkdir(webDist, { recursive: true });
  await writeFile(join(webDist, "index.html"), "<html>app</html>");
  running = await startSyncServer({
    token: TOKEN,
    dataDir: join(root, "data"),
    webDist,
    host: "127.0.0.1",
    port: 0,
  });
  base = `http://127.0.0.1:${running.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => running.server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

function putProject(id: string, body: unknown): Promise<Response> {
  return fetch(`${base}/api/projects/${id}`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("sync server", () => {
  it("rejects API calls without the token (401)", async () => {
    expect((await fetch(`${base}/api/projects`)).status).toBe(401);
    const wrong = await fetch(`${base}/api/projects`, { headers: { Authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
  });

  it("rejects ids that could escape the data folder", async () => {
    const res = await fetch(`${base}/api/projects/..%2Fx`, { headers: auth });
    expect(res.status).toBe(400);
    const media = await fetch(`${base}/api/projects/p1/media/a.b`, { headers: auth });
    expect(media.status).toBe(400);
  });

  it("round-trips a project and bumps the version", async () => {
    const put = await putProject("p1", { name: "Pasta", projectJson: '{"a":1}', baseVersion: 0 });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ version: 1 });

    const get = await fetch(`${base}/api/projects/p1`, { headers: auth });
    expect(await get.json()).toEqual({ projectJson: '{"a":1}', version: 1, name: "Pasta" });

    const list = (await (await fetch(`${base}/api/projects`, { headers: auth })).json()) as Array<{
      id: string;
      name: string;
      version: number;
    }>;
    expect(list).toEqual([expect.objectContaining({ id: "p1", name: "Pasta", version: 1 })]);
  });

  it("returns 409 for a stale baseVersion and accepts force", async () => {
    await putProject("p2", { name: "A", projectJson: "{}", baseVersion: 0 });
    await putProject("p2", { name: "A", projectJson: '{"v":2}', baseVersion: 1 });

    const stale = await putProject("p2", { name: "A", projectJson: '{"v":"old"}', baseVersion: 1 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ version: 2 });

    const forced = await putProject("p2", {
      name: "A",
      projectJson: '{"v":"old"}',
      baseVersion: 1,
      force: true,
    });
    expect(await forced.json()).toEqual({ version: 3 });
  });

  it("round-trips media with its content type", async () => {
    const url = `${base}/api/projects/p1/media/m1`;
    expect((await fetch(url, { method: "HEAD", headers: auth })).status).toBe(404);

    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const put = await fetch(url, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "image/jpeg" },
      body: bytes,
    });
    expect(put.status).toBe(200);

    const head = await fetch(url, { method: "HEAD", headers: auth });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("5");

    const get = await fetch(url, { headers: auth });
    expect(get.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(bytes);
  });

  it("answers CORS preflight for the desktop renderer only", async () => {
    const ok = await fetch(`${base}/api/projects`, {
      method: "OPTIONS",
      headers: { Origin: "app://openreel", "Access-Control-Request-Method": "PUT" },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("app://openreel");
    expect(ok.headers.get("access-control-allow-headers")).toContain("Authorization");

    const other = await fetch(`${base}/api/projects`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("serves the web app with SPA fallback and COOP/COEP", async () => {
    const res = await fetch(`${base}/some/deep/route`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>app</html>");
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(res.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
  });
});
