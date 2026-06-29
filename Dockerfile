FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public/ ./public/

# /data is mounted as a persistent volume in Coolify
VOLUME ["/data"]

ENV PORT=3000
ENV DB_PATH=/data/leaderboard.db

EXPOSE 3000

CMD ["node", "server.js"]
