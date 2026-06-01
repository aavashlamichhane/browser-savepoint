FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production
ENV PORT=8787
ENV SAVEPOINT_DATA_DIR=/data
ENV SAVEPOINT_TRUST_PROXY=true

EXPOSE 8787
VOLUME ["/data"]

CMD ["node", "server/src/index.js"]
