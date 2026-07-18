FROM node:24.15.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:24.15.0-bookworm-slim AS node-runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node

FROM node-runtime AS api

ENV API_HOST=0.0.0.0
ENV API_PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

FROM node-runtime AS preview

ENV PREVIEW_HOST=0.0.0.0
ENV PREVIEW_PORT=4174
EXPOSE 4174
CMD ["node", "apps/preview/dist/server.js"]

FROM nginx:1.28-alpine AS web

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080

FROM api AS final
