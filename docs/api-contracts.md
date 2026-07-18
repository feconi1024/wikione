# API contracts

Canonical runtime schemas live in `packages/contracts/src/index.ts`. Zod parses
untrusted data at browser/backend boundaries, and TypeScript types are inferred
from those schemas.

## Versioning and errors

- Product routes use the `/v1` prefix.
- Additive optional fields are allowed within v1. Removing fields, changing
  meanings, or tightening accepted inputs requires a new route version.
- Safe errors contain `code`, a bounded user-facing `message`, and optional
  `requestId`; raw MediaWiki responses and submitted source are never returned.
- Preview `clientRevision` is mandatory. The browser ignores any result older
  than its newest requested document state.

## Implemented routes

| Method | Route                   | Purpose                                                                 |
| ------ | ----------------------- | ----------------------------------------------------------------------- |
| GET    | `/healthz`              | Liveness response                                                       |
| GET    | `/v1/meta/contracts`    | API/package version metadata                                            |
| GET    | `/v1/wikis`             | Fixed enabled-wiki registry; currently English Wikipedia only           |
| POST   | `/v1/pages/source`      | Anonymous latest wikitext and base revision, or an empty new-page shape |
| POST   | `/v1/previews`          | Anonymous target compilation and short-lived opaque render URL          |
| GET    | `/v1/auth/availability` | Constant OAuth-registration-pending placeholder                         |
| GET    | `/openapi.json`         | Generated OpenAPI 3.1 document                                          |

There is no authentication-start, callback, session, token, publish, or wiki
write route in Milestone 1.

## Core implemented shapes

- `WikiDescriptor`: stable ID, display name, language/direction, and clean HTTPS
  base/API URLs. Clients submit only the ID; they cannot supply upstream hosts.
- `PageSourceRequest`: `wikiId` and a trimmed, non-empty title of at most 512
  characters.
- `PageSource`: normalized title, existence, wikitext, optional revision
  ID/timestamp, and fetch time. Source is bounded to 2,000,000 characters.
- `PreviewRequest`: wiki, title, source, literal `wikitext` model, and monotonic
  client revision. Source is bounded to 500,000 characters.
- `PreviewResult`: matching revision, render URL, normalized parser warnings,
  generation time, and expiry time. It contains neither source nor HTML.
- `AuthenticationAvailability`: always `{ available: false, reason:
"oauth-registration-pending", ... }` in this milestone.

Preview IDs are exactly 32 base64url characters generated from 24 random bytes.
Default bundle TTL is 120 seconds and cannot be configured above ten minutes.
The preview route is limited to 30 requests per minute per API instance/IP; a
public multi-instance deployment still needs shared adaptive upstream limits.

## Reserved contracts

The contract package retains future `AuthenticationStartResult`,
`SessionStatus`, `PublishRequest`, and `PublishResult` schemas to keep the
product boundary explicit. They do not imply a runnable route. OAuth and
publishing implementation must wait for registration and a separate security
review.
