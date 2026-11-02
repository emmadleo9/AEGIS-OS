@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-AEGIS.ps1"
exit /b %ERRORLEVEL%
