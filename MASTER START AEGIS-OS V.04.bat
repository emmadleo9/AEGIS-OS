@echo off
setlocal
title AEGIS-OS MASTER START v0.4
cd /d "%~dp0"

echo.
echo  =============================================================
echo   AEGIS-OS MASTER START v0.4
echo   Gateway ^(2785^) + Console ^(5173^) + WhatsApp API routes
echo  =============================================================
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-AEGIS.ps1"
set "START_EXIT=%ERRORLEVEL%"

if not "%START_EXIT%"=="0" (
    echo.
    echo [AEGIS-OS] Startup stopped with exit code %START_EXIT%.
    pause
)

exit /b %START_EXIT%
