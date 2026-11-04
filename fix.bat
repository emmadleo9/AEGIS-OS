@echo off
cd /d D:\AEGIS-OS
rmdir /s /q core
git clone https://github.com/open-jarvis/OpenJarvis core
rmdir /s /q core\.git
docker compose up -d --build
docker ps
