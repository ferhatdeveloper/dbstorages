# GraphCore frontend — Vite build + nginx
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY index.html vite.config.ts tsconfig.json tsconfig.node.json postcss.config.js tailwind.config.js ./
COPY src ./src

# Browser calls same-origin /api (nginx proxies to Node)
ARG VITE_NODE_API_BASE=/api
ARG VITE_GO_API_BASE=/api/v1
ENV VITE_NODE_API_BASE=$VITE_NODE_API_BASE
ENV VITE_GO_API_BASE=$VITE_GO_API_BASE

RUN npm run build

FROM nginx:1.27-alpine

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
