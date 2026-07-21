# Contributing to WikiOne

Thank you for helping make MediaWiki editing safer and easier. WikiOne is an
Overleaf-style editor, not a replacement for target-wiki governance. Preserve
the separation between a working first-party WikiOne account and the currently
disabled Wikimedia OAuth/upstream-write boundary.

## Before you start

- Read [the architecture](docs/architecture.md), [threat model](docs/threat-model.md),
  [API contracts](docs/api-contracts.md), and [Wikimedia API policy](docs/api-usage-policy.md).
- Use Node.js 24+, pnpm 11, PostgreSQL 17, and Redis 7. Docker Compose is the
  easiest way to start private services.
- Start from an up-to-date `main` branch and make a focused feature branch,
  normally named `codex/<area>-<description>` or `<area>/<description>`.
- Do not add OAuth credentials, live wiki cookies/tokens, user source, parser
  HTML, logs, browser artifacts, or other personal data to Git.

```sh
pnpm install --frozen-lockfile
docker compose up postgres redis -d
pnpm check
pnpm build
```

Run the editor locally with `pnpm dev`; its default editor/API/preview origins
are `http://127.0.0.1:5173`, `:3000`, and `:4174`. Copy `.env.example` only to
an ignored local environment file or export values in your shell. Never use the
example session keys outside loopback development.

## Change design and boundaries

Open an issue or design discussion before a cross-package change, a data model
change, an externally visible API change, or any work that could affect the
preview isolation/authentication boundary. Include the user outcome, affected
trust boundary, test plan, rollback approach, and whether an upstream request
would contact a target wiki.

These invariants require explicit review:

- target-rendered HTML belongs only on the cookie-free, isolated preview origin;
- the editor receives opaque preview URLs, never parser HTML in API JSON;
- wikis come from the fixed registry, not arbitrary user-provided endpoints;
- logs and durable stores must not contain wikitext, titles, summaries,
  passwords, cookies, tokens, or raw upstream bodies;
- first-party WikiOne sign-in may remain functional, but Wikimedia OAuth routes
  and `/v1/publish` must remain inert until consumer approval and a separately
  reviewed adapter are accepted; and
- a change to licensing, copied upstream code, or dependency licensing needs
  owner approval. The repository is MIT pending an explicit governance decision.

## Implementation standards

Use UTF-8 and LF line endings, four spaces for indentation, TypeScript strict
types, and self-contained comments at trust boundaries or where intent is not
obvious. Prefer the existing package boundaries over importing application
internals. Validate untrusted input with the contract schemas and return safe,
bounded errors. New dependencies need an active maintenance, size, and license
review.

Keep a commit to one coherent stage; do not accumulate more than two major
modifications before committing. Update `CHANGELOG.md` in the same stage. New
features and major rewrites belong on a branch, not directly on `main`.

## Tests required for a change

Run the narrowest relevant test while iterating, then run the applicable gates:

```sh
pnpm check
pnpm build
pnpm test:a11y
pnpm test:browser
pnpm test:visual
pnpm test:security
pnpm test:compat
pnpm test:load
pnpm openapi:check
```

`pnpm test:live` is intentionally separate: it performs bounded, sequential,
read-only MediaWiki requests. Do not run it in a loop, in a pull-request job,
or against a target without following the API policy. Browser and visual suites
may need their documented Playwright browsers installed. A security-sensitive
change also needs a threat-model update and negative tests.

## Pull requests and review

Describe the problem, design, behavior change, test commands/results, migration
or operational steps, accessibility impact, and security/privacy impact. Link
the issue and update public documentation/OpenAPI when a contract changes.
Reviewers should reject changes that weaken target isolation, broaden CORS,
introduce persistent source retention, silently enable OAuth/writes, or claim
deployment evidence that has not occurred.

Use conventional, imperative commit subjects such as `feat: add…`, `fix:…`, or
`docs:…`. A maintainer merges only a working branch with passing required gates;
the release operator, not a contributor, supplies cloud credentials, domains,
secrets, and external approval evidence.
