@echo off
rem Starts the OpenReel desktop app in dev mode.
rem OPENREEL_ALLOW_LOCAL_FETCH lets MCP import_media_from_url fetch from localhost/LAN (e.g. WAMP).
cd /d "%~dp0"
set OPENREEL_ALLOW_LOCAL_FETCH=1
call pnpm --filter @openreel/desktop dev
