FROM node:22-slim
RUN apt-get update && apt-get install -y python3 python3-pip make g++ && ln -s /usr/bin/python3 /usr/bin/python && apt-get clean
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm","start"]
