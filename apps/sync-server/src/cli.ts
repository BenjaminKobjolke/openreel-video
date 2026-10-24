import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { startSyncServer } from "./server.ts";

const token = process.env.OPENREEL_SYNC_TOKEN ?? "";
if (token.length < 8) {
  console.error("OPENREEL_SYNC_TOKEN must be set (at least 8 characters).");
  process.exit(1);
}

const port = Number(process.env.OPENREEL_SYNC_PORT ?? 5180);
const dataDir =
  process.env.OPENREEL_SYNC_DATA ?? fileURLToPath(new URL("../data", import.meta.url));
// Own build output: apps/web/dist holds the desktop build (no ffmpeg wasm) while start.bat runs.
const webDist =
  process.env.OPENREEL_SYNC_WEB ?? fileURLToPath(new URL("../web-dist", import.meta.url));

const running = await startSyncServer({ token, dataDir, webDist, port });

console.log(`OpenReel sync server on port ${running.port}`);
console.log(`  data: ${dataDir}`);
console.log(`  web:  ${webDist}`);
console.log(`  desktop app: http://localhost:${running.port}`);
for (const addresses of Object.values(networkInterfaces())) {
  for (const address of addresses ?? []) {
    if (address.family === "IPv4" && !address.internal) {
      console.log(`  phone:       http://${address.address}:${running.port}`);
    }
  }
}
