@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0STOP-KRYNARA.ps1"
exit /b %ERRORLEVEL%
