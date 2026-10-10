FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY public/ public/
COPY server/ server/
COPY data/ data/
COPY scripts/ scripts/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/index.js"]