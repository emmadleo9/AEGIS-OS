@echo off
echo Stopping AEGIS-OS...
taskkill /F /IM node.exe 2>nul
cd /d D:\AEGIS-OS
docker compose down
echo AEGIS-OS stopped.
