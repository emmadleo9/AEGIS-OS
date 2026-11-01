# AEGIS-OS — Console (AEGIS) — minimal Dockerfile
FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
