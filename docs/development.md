# Development

## Prerequisites

- Node.js 24 or newer
- pnpm 11
- PostgreSQL 17 for durable first-party accounts
- Redis 7 for encrypted sessions and preview bundles
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

`pnpm check` runs repository formatting, type-aware ESLint, strict
type-check targets, and the offline Vitest suite. The ordinary suite uses fake
MediaWiki clients and stores; it does not contact Wikimedia or write to a wiki.
The Playwright suite starts Vite, intercepts the documented HTTP boundaries,
and verifies the real editor in Chromium.

## Run from source

Start PostgreSQL, Redis, and all three development processes:

```sh
docker compose up postgres redis -d
pnpm dev
```

| Component        | Default URL                          |
| ---------------- | ------------------------------------ |
| Editor           | `http://127.0.0.1:5173`              |
| API              | `http://127.0.0.1:3000`              |
| OpenAPI document | `http://127.0.0.1:3000/openapi.json` |
| Preview origin   | `http://127.0.0.1:4174`              |

Individual processes are available as `pnpm dev:web`, `pnpm dev:api`, and
`pnpm dev:preview`. The API automatically applies the versioned account schema.
API and preview use separate Redis key prefixes. Browser drafts remain local.

## Containers

```sh
docker compose up --build --wait
pnpm test:local
```

Compose builds explicit `web`, `api`, and `preview` targets, waits for
PostgreSQL/Redis and service health checks, persists PostgreSQL in the named
`account-data` volume, and runs Redis without persistence. The editor is then
available on port 5173. Every published development port is bound to loopback;
the checked-in fixed credentials must never be used on a public interface. CI
builds every target and validates Compose syntax.

`pnpm test:local` is the real-stack acceptance gate. It verifies web CSP and
runtime configuration, API CORS/OpenAPI/readiness, PostgreSQL-backed account
creation and deletion, Redis-backed session recovery, the disabled publishing
boundary, and an isolated live Wikipedia preview. Its temporary account is
deleted even when a later check fails. The preview check intentionally needs
internet access but remains anonymous and read-only.

`pnpm test:local:resilience` additionally stops only the local Redis container,
proves API/preview liveness remains 200 while dependency readiness becomes 503
with `Retry-After`, restarts Redis in a `finally` recovery path, and then reruns
the complete acceptance gate. Existing local sessions and previews are expected
to expire because Redis is intentionally ephemeral.

For public deployment, replace loopback origins/CSP values, use HTTPS, keep the
preview hostname separate, set `COOKIE_SECURE=true`, and provide independent
random 32-byte `SESSION_ENCRYPTION_KEY_BASE64` and
`SESSION_LOOKUP_HMAC_KEY_BASE64` values from a secret manager. Use private
PostgreSQL/Redis networks, database credentials/backups, and a monitored
MediaWiki User-Agent contact. Do not add Wikimedia OAuth secrets until approval.

The checked-in base64 session values are local Compose examples, not secrets.
When running source services outside Compose and no keys are set, non-production
API startup generates ephemeral keys; restarting invalidates those sessions.

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
