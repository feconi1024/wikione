# Development

## Prerequisites

- Node.js 24 or newer
- pnpm 11
- Redis 7 for the live API/preview path
- Optional: Docker with Compose
- Chromium installed by Playwright for browser tests

`.env.example` documents every current variable. The checked-in defaults work
for loopback development; `.env` files are ignored. Node services read process
environment directly, so export overrides in the shell or use Compose.

## Install and verify

```sh
pnpm install
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs repository formatting, type-aware ESLint, ten strict
type-check targets, and the offline Vitest suite. The ordinary suite uses fake
MediaWiki clients and stores; it does not contact Wikimedia or write to a wiki.
The Playwright suite starts Vite, intercepts the documented HTTP boundaries,
and verifies the real editor in Chromium.

## Run from source

Start Redis and all three persistent development processes:

```sh
docker compose up redis -d
pnpm dev
```

| Component        | Default URL                          |
| ---------------- | ------------------------------------ |
| Editor           | `http://127.0.0.1:5173`              |
| API              | `http://127.0.0.1:3000`              |
| OpenAPI document | `http://127.0.0.1:3000/openapi.json` |
| Preview origin   | `http://127.0.0.1:4174`              |

Individual processes are available as `pnpm dev:web`, `pnpm dev:api`, and
`pnpm dev:preview`. API and preview share Redis through opaque, expiring bundle
IDs; neither service stores drafts.

## Containers

```sh
docker compose up --build
```

Compose builds explicit `web`, `api`, and `preview` targets, waits for health
checks, and runs Redis with persistence disabled. The editor is then available
on port 5173. CI builds every target and validates `docker compose config`.

For public deployment, replace all loopback origins in service environment and
`apps/web/nginx.conf`, use HTTPS, and supply a descriptive User-Agent with a
monitored contact. Do not add OAuth secrets until registration is approved.

## Live rendering baseline

Run this command intentionally; it contacts Wikimedia sequentially and writes
ignored artifacts:

```sh
pnpm test:live
pnpm spike:serve
```

The four fixtures prove English, Chinese, RTL, images, tables, templates,
references, MathML, audio, and video structure. This validation is deliberately
separate from CI to avoid background upstream traffic.

## Repository conventions

- Use UTF-8, LF endings, four-space indentation, and comments at trust
  boundaries or non-obvious behavior.
- Work on feature branches and commit each coherent stage before beginning more
  than two major modifications.
- Update `CHANGELOG.md` for every staged change.
- Never commit `AGENTS.md`, agent/editor state, generated artifacts, browser
  traces, credentials, logs, or user data.
- Do not copy GPL Wikimedia CodeMirror extension source. WikiOne remains MIT;
  new runtime dependencies must be license-reviewed.
