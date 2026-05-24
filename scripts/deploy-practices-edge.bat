@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-practices-edge.ps1"
exit /b %ERRORLEVEL%
