# Development

## Prerequisites

- Node.js 24 or newer
- pnpm 11
- Optional: Docker with Compose for container verification and Redis
- Network access only for dependency installation and explicit live fixture
  validation

Copy `.env.example` to `.env` only when local overrides are needed. `.env` is
ignored and must never be committed.

## Install and verify

```sh
pnpm install
pnpm check
pnpm build
```

`pnpm check` runs formatting verification, ESLint with type information,
TypeScript strict checks, and the offline Vitest suite. The test suite must not
contact Wikimedia or write to public wikis.

## Rendering spike

Run the live validator intentionally:

```sh
pnpm test:live
```

It performs four sequential fixture renders, writes ignored output beneath
`artifacts/render-spike/`, and fails when a pinned revision disappears, language
direction changes, or a controlled media feature is absent. It supplies
`maxlag=5`, an identified User-Agent, a 15-second request timeout, and no retry
storm.

Render without assertions and serve the output locally with:

```sh
pnpm spike:render
pnpm spike:serve
```

Preview pages are then available at, for example,
`http://127.0.0.1:4174/previews/media-suite`. A real editor must embed this URL
in an iframe with `sandbox="allow-scripts allow-same-origin"` from a different
origin. Do not serve the editor and preview from the same origin.

## API application

```sh
pnpm --filter @wikione/api build
pnpm --filter @wikione/api start
```

The API listens on `127.0.0.1:3000` by default. Environment variables may set
`API_HOST` and `API_PORT`.

## Containers

```sh
docker compose up --build
```

The composition starts the API and Redis. Milestone 0 does not connect the API
to Redis yet; the service is present to stabilize local and CI infrastructure
for upcoming session and render-bundle work. CI builds the API image on every
branch push.

## Repository conventions

- Use UTF-8, LF endings, four-space indentation, and self-contained comments at
  trust boundaries or non-obvious behavior.
- Work on feature branches and commit each coherent stage before beginning more
  than two major modifications.
- Update `CHANGELOG.md` for every staged change.
- Never commit `AGENTS.md`, agent/editor state, generated artifacts, credentials,
  logs, or user data.
- The repository is MIT-licensed. Do not copy GPL CodeMirror/MediaWiki extension
  sources into it.
