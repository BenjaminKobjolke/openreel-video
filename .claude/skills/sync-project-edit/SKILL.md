---
name: sync-project-edit
description: Edit a project stored on the OpenReel sync server when asked to change a server project, including a named project such as the pasta project.
---

# Edit a project stored on the sync server

Use the bundled `sync_project.py` from the repository root. It uses Python's standard library only.

1. Pull the project with `python .claude/skills/sync-project-edit/sync_project.py pull <name>`.
   The script checks the small server project list first and downloads the project JSON only if
   its version differs from the local cache. It never downloads or uploads media files.
2. Run `python .claude/skills/sync-project-edit/sync_project.py summary <name>` to find the target
   clip. Match the media type and name with the track and clip details. If more than one clip fits,
   ask which one the user means before editing.
3. Do not read the whole `project.json` into the conversation. If the summary cannot answer a
   detail, open only the relevant part of the cached file.
4. Edit the cached `project.json` with a short Python script that reads and writes UTF-8 JSON.
   Preserve every existing id. Give every new keyframe or effect a `uuid4` id. When changing a
   clip's length, update `duration` and `outPoint` for image clips, and set `timeline.duration` to
   the greatest clip end across all tracks. Never edit media entries or files under `media/`.
5. Before uploading, show a short before-and-after summary of the fields that changed.
6. Upload with `python .claude/skills/sync-project-edit/sync_project.py push <name>`. It sends the
   cached base version and will not force an overwrite. After a successful upload, tell the user to
   open or refresh the project on the device and tap **Load server version**. If that device has
   unsaved edits open, its next automatic upload may receive a `409`; that is expected.
7. If upload reports a `409`, run `pull` again and redo the edit on the newer cached version. Never
   force the upload.

## Worked example

For “make the image in pasta project rotate 3 seconds longer”, suppose the matching image clip has
`duration: 10`, `outPoint: 10`, and rotation keyframes at time 0 (value 0) and time 10 (value 360).
Set `duration` and `outPoint` to 13, move the last rotation keyframe to time 13, and set
`timeline.duration` to 13. Keeping the same rotation speed would instead make the last value 468;
ask the user which result they want when the wording is unclear.

## Project JSON and cache

The cached document has a top-level `version` and `project`. The project contains `id`, `name`,
`modifiedAt`, `settings`, `mediaLibrary.items`, and `timeline.tracks`. A track contains clips with
`id`, `mediaId`, `trackId`, `startTime`, `duration`, `inPoint`, `outPoint`, `effects`, `transform`
(`position`, `scale`, `rotation`, `anchor`, `opacity`, `fitMode`), and `keyframes`. Keyframe times
are seconds relative to the clip start. Other project clip lists include `textClips`, `shapeClips`,
`svgClips`, `stickerClips`, and `motionCompositions`.

The default cache is `~/.openreel/claude-edit/<project-id>/`, with a pretty-printed `project.json`
and a `base.json` holding the id, name, and server version. `OPENREEL_EDIT_CACHE` overrides the
cache root. `OPENREEL_SYNC_URL` overrides the server URL (default `http://localhost:5180`). The
script reads `OPENREEL_SYNC_TOKEN` from the environment or from the repository's
`start-server.bat`; it never displays the token.
