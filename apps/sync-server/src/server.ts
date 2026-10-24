import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep, extname } from "node:path";
import { pipeline } from "node:stream/promises";

const MAX_JSON_BYTES = 64 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface SyncServerOptions {
  readonly token: string;
  readonly dataDir: string;
  /** Folder with the built web app (apps/web/dist). Static files need no token. */
  readonly webDist?: string;
  readonly host?: string;
  readonly port?: number;
}

export interface RunningSyncServer {
  readonly server: Server;
  readonly port: number;
  readonly host: string;
}

interface ProjectMeta {
  name: string;
  modifiedAt: number;
  version: number;
}

// Same headers as apps/web/public/_headers, so SharedArrayBuffer etc. keep working.
const STATIC_HEADERS: Record<string, string> = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".onnx": "application/octet-stream",
};

/** Desktop renderer (app://openreel) and local Vite dev servers may call the API cross-origin. */
function isAllowedOrigin(origin: string): boolean {
  return (
    origin === "app://openreel" ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

function corsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || !isAllowedOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
    "Cross-Origin-Resource-Policy": "cross-origin",
    Vary: "Origin",
  };
}

function sendJson(req: IncomingMessage, res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...corsHeaders(req),
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers["authorization"];
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function tokenMatches(provided: string | null, expected: string): boolean {
  if (provided === null || expected.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(new HttpError(413, "Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Write via temp file + rename so a crash never leaves a half-written file. */
async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, path);
}

function checkId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new HttpError(400, "Invalid id");
  return id;
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  parts: string[],
  dataDir: string,
): Promise<void> {
  // parts: ["projects"], ["projects", id], ["projects", id, "media", mediaId]
  if (parts[0] !== "projects" || parts.length > 4 || parts.length === 3) {
    throw new HttpError(404, "Not found");
  }

  if (parts.length === 1) {
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
    await mkdir(dataDir, { recursive: true });
    const entries = await readdir(dataDir, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue;
      const meta = await readJsonFile<ProjectMeta>(join(dataDir, entry.name, "meta.json"));
      if (meta) projects.push({ id: entry.name, ...meta });
    }
    projects.sort((a, b) => b.modifiedAt - a.modifiedAt);
    sendJson(req, res, 200, projects);
    return;
  }

  const projectDir = join(dataDir, checkId(parts[1]));
  const metaPath = join(projectDir, "meta.json");

  if (parts.length === 2) {
    if (req.method === "GET") {
      const meta = await readJsonFile<ProjectMeta>(metaPath);
      if (!meta) throw new HttpError(404, "Project not found");
      const projectJson = await readFile(join(projectDir, "project.json"), "utf8");
      sendJson(req, res, 200, { projectJson, version: meta.version, name: meta.name });
      return;
    }
    if (req.method === "PUT") {
      const body = (await readJsonBody(req)) as {
        name?: unknown;
        projectJson?: unknown;
        baseVersion?: unknown;
        force?: unknown;
      };
      if (typeof body.projectJson !== "string" || typeof body.name !== "string") {
        throw new HttpError(400, "name and projectJson must be strings");
      }
      const current = await readJsonFile<ProjectMeta>(metaPath);
      const currentVersion = current?.version ?? 0;
      if (body.force !== true && body.baseVersion !== currentVersion) {
        sendJson(req, res, 409, { version: currentVersion, modifiedAt: current?.modifiedAt });
        return;
      }
      await mkdir(projectDir, { recursive: true });
      await writeAtomic(join(projectDir, "project.json"), body.projectJson);
      const meta: ProjectMeta = {
        name: body.name,
        modifiedAt: Date.now(),
        version: currentVersion + 1,
      };
      await writeAtomic(metaPath, JSON.stringify(meta));
      sendJson(req, res, 200, { version: meta.version });
      return;
    }
    throw new HttpError(405, "Method not allowed");
  }

  if (parts[2] !== "media") throw new HttpError(404, "Not found");
  const mediaDir = join(projectDir, "media");
  const mediaPath = join(mediaDir, checkId(parts[3]));

  if (req.method === "GET" || req.method === "HEAD") {
    const info = await stat(mediaPath).catch(() => null);
    if (!info) {
      res.writeHead(404, corsHeaders(req)).end();
      return;
    }
    const sidecar = await readJsonFile<{ contentType?: string }>(`${mediaPath}.json`);
    res.writeHead(200, {
      ...corsHeaders(req),
      "Content-Type": sidecar?.contentType || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    await pipeline(createReadStream(mediaPath), res);
    return;
  }

  if (req.method === "PUT") {
    await mkdir(mediaDir, { recursive: true });
    const tmp = `${mediaPath}.${randomUUID()}.tmp`;
    try {
      await pipeline(req, createWriteStream(tmp));
      await rename(tmp, mediaPath);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
    const contentType = req.headers["content-type"] || "application/octet-stream";
    await writeAtomic(`${mediaPath}.json`, JSON.stringify({ contentType }));
    sendJson(req, res, 200, { ok: true });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  webDist: string,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, STATIC_HEADERS).end();
    return;
  }
  const root = resolve(webDist);
  let filePath = resolve(root, `.${decodeURIComponent(pathname)}`);
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    res.writeHead(403, STATIC_HEADERS).end();
    return;
  }
  let info = await stat(filePath).catch(() => null);
  if (info?.isDirectory()) {
    filePath = join(filePath, "index.html");
    info = await stat(filePath).catch(() => null);
  }
  // SPA fallback, like apps/web/public/_redirects.
  if (!info || !info.isFile()) {
    filePath = join(root, "index.html");
    info = await stat(filePath).catch(() => null);
    if (!info) {
      res.writeHead(404, STATIC_HEADERS).end("Web build not found. Run: pnpm --filter @openreel/web build");
      return;
    }
  }
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    ...STATIC_HEADERS,
    "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": ext === ".html" || filePath.endsWith("sw.js") ? "no-cache" : "public, max-age=3600",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  await pipeline(createReadStream(filePath), res);
}

export function startSyncServer(options: SyncServerOptions): Promise<RunningSyncServer> {
  const host = options.host ?? "0.0.0.0";
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
          if (req.method === "OPTIONS") {
            res.writeHead(204, corsHeaders(req)).end();
            return;
          }
          if (!tokenMatches(bearerToken(req), options.token)) {
            sendJson(req, res, 401, { error: "Unauthorized" });
            return;
          }
          const parts = url.pathname.split("/").filter(Boolean).slice(1);
          await handleApi(req, res, parts, options.dataDir);
          return;
        }
        if (!options.webDist) {
          res.writeHead(404).end();
          return;
        }
        await serveStatic(req, res, url.pathname, options.webDist);
      } catch (error) {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        if (error instanceof HttpError) {
          sendJson(req, res, error.status, { error: error.message });
          return;
        }
        console.error("[sync-server]", error);
        sendJson(req, res, 500, { error: "Internal server error" });
      }
    })();
  });

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({ server, port, host });
    });
  });
}
