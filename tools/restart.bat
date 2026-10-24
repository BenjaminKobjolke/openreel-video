@echo off
rem Signals running start.bat / start-server.bat to restart. Usage: restart.bat [desktop|server]
cd /d "%~dp0.."
if "%~1"=="" (type nul > _restart_desktop & type nul > _restart_server) else type nul > _restart_%~1
exit /b 0
