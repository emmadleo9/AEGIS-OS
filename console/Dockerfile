# AEGIS-OS — Console (AEGIS dark OLED face) Dockerfile
# Builds the Vite + React app and serves it with nginx on port 3000.

# ===== Stage 1: Builder =====
FROM node:22-alpine AS builder

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ===== Stage 2: Runtime =====
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
