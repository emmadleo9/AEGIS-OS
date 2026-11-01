@echo off
echo Starting AEGIS-OS...
cd /d D:\AEGIS-OS
docker compose up -d
timeout /t 5 /nobreak >nul
start "Gateway" cmd /k "cd /d D:\AEGIS-OS\gateway && npm run dev"
timeout /t 3 /nobreak >nul
start "Console" cmd /k "cd /d D:\AEGIS-OS\console && npm run dev"
echo AEGIS-OS started. Console: http://localhost:5173  Gateway: http://localhost:2785
