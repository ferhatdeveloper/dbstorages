# GraphCore frontends — web (marketing) + console → nginx
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY apps/console/package.json ./apps/console/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci || npm install

COPY apps ./apps
COPY packages ./packages
COPY tsconfig.json* ./

ARG VITE_NODE_API_BASE=/api
ARG VITE_GO_API_BASE=/api/v1
ARG VITE_WEB_URL=
ARG VITE_CONSOLE_URL=
ARG VITE_BASE=/app/

ENV VITE_NODE_API_BASE=$VITE_NODE_API_BASE \
    VITE_GO_API_BASE=$VITE_GO_API_BASE \
    VITE_WEB_URL=$VITE_WEB_URL \
    VITE_CONSOLE_URL=$VITE_CONSOLE_URL

# Marketing (site root)
RUN npm run build -w @graphcore/web

# Console under /app/
ENV VITE_BASE=$VITE_BASE
RUN npm run build -w @graphcore/console

FROM nginx:1.27-alpine

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY --from=build /app/apps/console/dist /usr/share/nginx/html/app

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
