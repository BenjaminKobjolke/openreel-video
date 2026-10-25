@echo off
rem Tickets Watcher build check: type-checks and builds the web app like start-server.bat does.
rem Builds into %TEMP% so dist\ and the sync server's web-dist stay untouched.
pushd "%~dp0.." || exit /b 1

call pnpm --filter @openreel/web exec tsc --noEmit --pretty false
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" goto done

call pnpm --filter @openreel/web exec vite build --outDir "%TEMP%\openreel-check-build" --emptyOutDir
set "RC=%ERRORLEVEL%"

:done
popd
exit /b %RC%
