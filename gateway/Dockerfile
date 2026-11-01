# AEGIS-OS — Gateway (OpenWA) — minimal Dockerfile
FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 2785
CMD ["npm", "start"]
