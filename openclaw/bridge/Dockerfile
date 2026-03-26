FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY bridge/package.json bridge/package-lock.json* ./
RUN npm install --omit=dev

COPY bridge/server.js .
COPY workspace/ ./workspace/

EXPOSE 3100

CMD ["node", "server.js"]
