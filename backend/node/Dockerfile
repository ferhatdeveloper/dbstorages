# GraphCore Node control-plane
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache wget

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NODE_PORT=4000

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# Do not bake secrets; Dokploy / compose injects env
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

CMD ["node", "app.js"]
