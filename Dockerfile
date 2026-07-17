FROM node:24.15.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @wikione/api... build

FROM node:24.15.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app /app

EXPOSE 3000
USER node
CMD ["node", "apps/api/dist/server.js"]
