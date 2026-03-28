FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js pgmq.js ./

EXPOSE 3100

CMD ["node", "server.js"]
