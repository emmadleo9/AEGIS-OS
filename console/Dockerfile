FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npx","serve","-s","build","-l","3000"]
