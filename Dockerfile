# syntax=docker/dockerfile:1.7
# Base image digests are verified with `docker buildx imagetools inspect`.
FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# The context intentionally excludes local dependencies, artifacts, credentials,
# and editor state through .dockerignore.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/preview/package.json apps/preview/package.json
COPY apps/render-spike/package.json apps/render-spike/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages
RUN --mount=type=cache,id=wikione-pnpm,target=/pnpm/store \
    --mount=type=cache,id=wikione-pnpm-metadata,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile \
    && pnpm exec turbo --version

COPY . .
RUN --mount=type=cache,id=wikione-pnpm,target=/pnpm/store \
    --mount=type=cache,id=wikione-pnpm-metadata,target=/root/.cache/pnpm \
    pnpm build \
    && pnpm --offline --filter @wikione/api deploy --prod --legacy /opt/wikione/api \
    && pnpm --offline --filter @wikione/preview deploy --prod --legacy /opt/wikione/preview

FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS node-runtime

ARG VCS_REF=unknown
ARG VERSION=0.0.0-dev
ARG SOURCE_URL=https://github.com/feconi1024/wikione
LABEL org.opencontainers.image.title="WikiOne" \
      org.opencontainers.image.description="Overleaf-style MediaWiki editor service" \
      org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.licenses=MIT

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app
USER node

FROM node-runtime AS api

COPY --from=build --chown=node:node /opt/wikione/api /app
ENV API_HOST=0.0.0.0 \
    API_PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/livez').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]

FROM node-runtime AS preview

COPY --from=build --chown=node:node /opt/wikione/preview /app
ENV PREVIEW_HOST=0.0.0.0 \
    PREVIEW_PORT=4174
EXPOSE 4174
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4174/livez').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]

FROM nginxinc/nginx-unprivileged:1.28-alpine@sha256:7377697a821c131a924a7105fafbe7414db4e9fcc77a6f08f776f33f141ec3f8 AS web

ARG VCS_REF=unknown
ARG VERSION=0.0.0-dev
ARG SOURCE_URL=https://github.com/feconi1024/wikione
LABEL org.opencontainers.image.title="WikiOne web" \
      org.opencontainers.image.description="WikiOne editor static web application" \
      org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.licenses=MIT

# nginxinc/nginx-unprivileged runs as uid 101 and renders this template at
# container start. The filter keeps Nginx's own variables (for example $uri)
# intact while allowing exact deployment origins to be injected.
ENV API_ORIGIN=https://api.example.invalid \
    PREVIEW_ORIGIN=https://preview.example.invalid \
    NGINX_ENVSUBST_FILTER=API_ORIGIN|PREVIEW_ORIGIN
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=0555 infra/container/web-runtime-config.sh /docker-entrypoint.d/20-wikione-runtime-config.sh
COPY --from=build --chown=101:101 /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/livez || exit 1

FROM api AS final
