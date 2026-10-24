# Sync server

Share projects between the desktop app (including edits made by an MCP agent) and a phone browser. A small Node server on the PC stores projects on disk. It also serves the web app to the phone.

```
Desktop app (+ MCP agent) --http://localhost:5180/api--> sync server --> DATA_DIR/{projectId}/
Phone browser ------------http://<PC-IP>:5180/---------> same server (web app + /api)
```

**One device edits at a time.** Every upload sends the server version it is based on. If another device uploaded in between, the server answers `409` and the upload stops with a warning. Edits are never merged.

## Run it

Requires Node 23.6 or later, because the server runs its TypeScript sources directly (`node src/cli.ts`).

```bat
start-server.bat          rem start (builds the web app on first run)
start-server.bat build    rem rebuild the web app, then start
```

`start-server.bat` lives in the repo root and is gitignored because it holds the token. It sets:

| Variable | Default in the bat | Meaning |
| --- | --- | --- |
| `OPENREEL_SYNC_TOKEN` | generated | Bearer token. Required, at least 8 characters. |
| `OPENREEL_SYNC_PORT` | `5180` | Listen port. The server binds `0.0.0.0`. |
| `OPENREEL_SYNC_DATA` | `%USERPROFILE%\.openreel\sync-data` | Project storage. Keep it outside any web root, such as `D:\wamp64\www`. |
| `OPENREEL_SYNC_WEB` | `apps\sync-server\web-dist` | Web build served to the phone. |

The server serves its own web build, not `apps/web/dist`. The desktop `predev`/`build:renderer` step writes a desktop build to `apps/web/dist`, and that build has no ffmpeg wasm. Export on the phone would break with it.

At startup the server prints the desktop URL and every LAN URL for the phone.

### Windows firewall (once)

Run in an admin PowerShell:

```powershell
New-NetFirewallRule -DisplayName "OpenReel sync 5180" -Direction Inbound -Protocol TCP -LocalPort 5180 -Profile Private -Action Allow
```

The Wi-Fi network must have the `Private` profile. Check it with `Get-NetConnectionProfile`.

## Use it

Edits from Claude Code go through the `sync-project-edit` skill in `.claude/skills/`; it caches
projects in `~/.openreel/claude-edit` and downloads only when the server version changed.

### Desktop app

1. Start the server, then start the app (`start.bat`).
2. On the start page, enter the URL `http://localhost:5180` and the token, then click **Continue**.
   - Use `localhost`, not the LAN IP. The renderer runs on `app://openreel`, and Chromium treats `localhost` as trustworthy.
3. Open a project and click **Sync → Save to server** in the title bar. This links the project. The same **Sync** menu lists **Server projects**.
4. **Settings → Sync** can still be used to edit the server URL and token later.

### Phone

1. Open `http://<PC-IP>:5180` on the same Wi-Fi.
2. On the start page, paste the token. Leave the server URL empty, because it defaults to the page's own address.
3. **Server projects** appears in two places: on the welcome screen and in the project-name menu in the top bar. Tap a project to open it.
4. **Settings → Sync** can still be used to edit the token later.

### Day to day

- A linked project uploads about 3 s after each auto-save. This also covers the agent's `save_project`, so agent edits reach the server without extra MCP tools.
- When a linked project opens (refresh, **Recover Project**, recent, app start), a banner offers **Load server version** if another device uploaded since this device last synced. The check compares the server `version` with the version stored locally in `localStorage` (`openreel-sync-versions`). It is silent when the server is offline.
- To continue on another device, open the project from **Server projects**. This downloads the latest version and keeps the same project id.
- After a `409` warning, auto-upload stops for that project. You then have two choices:
  - **Server projects → open** takes the other device's version.
  - **Save to server** overwrites the server copy. It always force-uploads.

## API

Every `/api` route requires `Authorization: Bearer <token>`. Static files need no token. Ids must match `^[A-Za-z0-9_-]{1,64}$`.

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/api/projects` | `[{ id, name, modifiedAt, version }]`, newest first |
| `GET` | `/api/projects/:id` | `{ projectJson, version, name }` |
| `PUT` | `/api/projects/:id` | Body `{ name, projectJson, baseVersion, force? }` → `{ version }`. If `baseVersion` is stale and `force` is not set, returns `409 { version }`. |
| `HEAD`/`GET` | `/api/projects/:id/media/:mediaId` | Raw bytes with the stored `Content-Type`. `404` if missing. |
| `PUT` | `/api/projects/:id/media/:mediaId` | Raw bytes, streamed to disk. |

On-disk layout: `DATA_DIR/{id}/meta.json` (`name`, `modifiedAt`, `version`), `project.json`, and `media/{mediaId}` plus a `media/{mediaId}.json` content-type sidecar. Writes go to a temp file and are then renamed into place.

CORS allows `app://openreel` and `http(s)://localhost|127.0.0.1[:port]`, and answers Private Network Access preflights. Static responses carry the COOP/COEP headers from `apps/web/public/_headers`, plus the SPA fallback to `index.html`.

## Code

| Part | File |
| --- | --- |
| Server | `apps/sync-server/src/server.ts` (`startSyncServer`), `src/cli.ts` |
| Server tests | `apps/sync-server/src/server.test.ts` |
| Client sync (push, pull, auto-push) | `apps/web/src/services/sync-service.ts` (+ `.test.ts`) |
| Project JSON for transfer | `serializeProjectForTransfer` / `parseTransferredProject` in `apps/web/src/services/project-package.ts` |
| Settings | `syncServerUrl`, `syncToken` in `apps/web/src/stores/settings-store.ts`; UI in `components/editor/settings/SyncPanel.tsx` |
| Server project list | `apps/web/src/components/editor/ServerProjects.tsx`, used in `ProjectSwitcher`, `WelcomeScreen`, `DesktopStartScreen`, `DesktopSyncMenu`. It lists the open project too, so re-opening it pulls the other device's edits. |
| Newer-version banner | `apps/web/src/components/editor/NewerOnServerBanner.tsx` (`findNewerServerVersion`), mounted in `App.tsx` and `DesktopApp.tsx` |
| Desktop Sync menu | `apps/web/src/desktop/editor/DesktopSyncMenu.tsx`, mounted in `DesktopApp.tsx` |
| Insecure-context fix | `apps/web/src/utils/random-uuid-polyfill.ts`, imported first in `main.tsx` |
| Service worker | `apps/web/public/sw.js` skips `/api/` |

How a pull works: the client downloads the JSON and any media that is not already in IndexedDB. It writes the project as an auto-save slot, then opens it through `recoverFromAutoSave`. That is the same path as Recent projects, so media is restored the same way.

## Limits

- Plain http on the LAN. The token travels unencrypted, and anyone on the network who has the token can read and write projects. Use it on a home network only.
- The phone page is not a secure context. It has no `SharedArrayBuffer` (export is single-threaded and slower), no File System Access, and no service worker. `crypto.randomUUID` is polyfilled only on the main thread, not in workers.
- Edits are not merged. Stale uploads get a warning instead.
- Not included: MCP tools to list or open server projects (the agent works on whatever the desktop app has open), HTTPS, and multiple user accounts.
