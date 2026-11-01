@echo off
cd /d D:\AEGIS-OS
rmdir /s /q brain
rmdir /s /q gateway
rmdir /s /q console
git clone https://github.com/open-jarvis/OpenJarvis brain
rmdir /s /q brain\.git
git clone https://github.com/rmyndharis/OpenWA gateway
rmdir /s /q gateway\.git
git clone https://github.com/matiasbattocchia/open-bsp-ui console
rmdir /s /q console\.git
docker compose up -d --build
docker ps
