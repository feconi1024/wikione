# API contracts

The canonical runtime schemas live in `packages/contracts/src/index.ts` and use
Zod so browser and backend code reject malformed data consistently. TypeScript
types are inferred from those schemas rather than maintained separately.

## Versioning

- Public routes use an explicit `/v1` prefix.
- Additive optional fields are allowed within v1.
- Removing fields, changing meanings, or tightening accepted inputs requires a
  new route version.
- Every error response will use a discriminated status/code rather than expose a
  raw MediaWiki response.

## Core shapes

- `WikiDescriptor`: stable wiki ID, display name, language/direction, and
  validated HTTPS base/API URLs.
- `PageSource`: title, existence, wikitext, optional base revision, and fetch
  time.
- `PreviewRequest`: wiki, title, source, `wikitext` content model, and monotonic
  client revision.
- `PreviewResult`: matching client revision, short-lived render URL, normalized
  warnings, and generation time.
- `PublishRequest`: source, base revision/timestamps, non-empty summary, minor
  flag, and explicit watchlist behavior.
- `PublishResult`: one of `published`, `conflict`,
  `authentication-required`, or `rejected`.

The monotonic preview revision is mandatory: the browser must ignore any result
whose revision does not match its newest requested document state.

## Current endpoints

Milestone 0 exposes only:

- `GET /healthz`
- `GET /v1/meta/contracts`
- `GET /openapi.json`

Page, preview, session, authentication, and publish endpoints are reserved for
their implementation milestones. They must use the existing contracts instead
of creating parallel wire formats.
