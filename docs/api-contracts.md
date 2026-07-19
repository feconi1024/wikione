# API contracts

Canonical runtime schemas live in `packages/contracts/src/index.ts`. Zod parses
untrusted data at browser/backend boundaries, and TypeScript types are inferred
from those schemas.

## Versioning and errors

- Product routes use the `/v1` prefix.
- Additive optional fields are allowed within v1. Removing fields, changing
  meanings, or tightening accepted inputs requires a new route version.
- Safe errors contain `code`, a bounded user-facing `message`, and optional
  `requestId`; raw MediaWiki responses, credentials, and submitted source are
  never returned.
- Authentication and account responses use `Cache-Control: no-store` and vary
  on Origin.

## Implemented routes

| Method | Route                         | Purpose                                                              |
| ------ | ----------------------------- | -------------------------------------------------------------------- |
| GET    | `/healthz`                    | Liveness response                                                    |
| GET    | `/v1/meta/contracts`          | API/package version metadata                                         |
| GET    | `/v1/wikis`                   | Fixed wiki registry; English Wikipedia only                          |
| POST   | `/v1/pages/source`            | Anonymous latest wikitext/base revision or new-page shape            |
| POST   | `/v1/pages/revision-check`    | Anonymous unchanged/changed/created/missing classification           |
| POST   | `/v1/previews`                | Anonymous target compilation and short-lived render URL              |
| GET    | `/v1/auth/availability`       | Separate WikiOne and Wikimedia capability status                     |
| POST   | `/v1/auth/register`           | Create a first-party account and session                             |
| POST   | `/v1/auth/login`              | Verify credentials and create a session                              |
| GET    | `/v1/auth/session`            | Recover safe identity, CSRF value, expiry, and wiki connection state |
| POST   | `/v1/auth/refresh`            | Atomically rotate session and CSRF values                            |
| POST   | `/v1/auth/logout`             | Revoke the current session                                           |
| POST   | `/v1/auth/logout-all`         | Revoke every session for the account                                 |
| PATCH  | `/v1/account`                 | Update display name                                                  |
| POST   | `/v1/account/password`        | Change password and revoke previous sessions                         |
| DELETE | `/v1/account`                 | Password-confirmed account deletion                                  |
| GET    | `/v1/auth/wikimedia/start`    | Nonfunctional approval-pending placeholder                           |
| GET    | `/v1/auth/wikimedia/callback` | Nonfunctional approval-pending placeholder                           |
| GET    | `/v1/publish/capability`      | Constant public-OAuth approval gate                                  |
| POST   | `/v1/publish/prepare`         | Read-only create/update/conflict preflight                           |
| POST   | `/v1/publish`                 | Deterministic 503; performs no edit                                  |
| GET    | `/openapi.json`               | Generated OpenAPI 3.1 document                                       |

## Authentication boundary

`SessionStatus` is provider-discriminated. An authenticated response contains a
`provider: "wikione"` account identity; `wikimedia.connected` remains false.
No shape permits a WikiOne password session to masquerade as wiki authorization.

Registration/login require an exact configured editor `Origin`. Every
cookie-authenticated mutation additionally requires the current
`X-WikiOne-CSRF` value. Cookies are opaque, HTTP-only, host-only, `SameSite=Lax`,
and `Secure` outside explicit loopback configuration.

Username, display-name, password, source, title, summary, and error lengths are
bounded. Passwords never appear in response contracts. There is no email or
automated password-recovery contract in the initial first-party workflow.

## Publishing preparation

`PublishPreparationRequest` carries the proposed source, exact base source,
paired base revision ID/timestamp, edit start time, required summary, minor flag,
and watchlist choice. The API anonymously fetches only the latest wiki source:

- no base and still missing: `ready/create`;
- same base revision: `ready/update`;
- new page appeared: `conflict/page-created`;
- page disappeared: `conflict/page-deleted`; or
- revision changed: `conflict/revision-changed` with latest source.

The browser performs its local base/draft/latest merge. `publishing-core` also
defines a future publisher port, create-only/update safeguards, exact revision
verification, and a bounded error union for edit conflicts, AbuseFilter,
CAPTCHA, protection, permission, rate limit, bad token, read-only mode, and
verification failure. Only fake and disabled providers exist now.

The runtime contains no Wikimedia code exchange, access/refresh token,
authenticated Action API client, or upstream edit request. Both OAuth
placeholder routes and `/v1/publish` return an approval-pending error.

## Preview contract

Preview IDs are exactly 32 base64url characters generated from 24 random bytes.
Default bundle TTL is 120 seconds and cannot exceed ten minutes. The browser
accepts only the newest `clientRevision`. Preview results contain neither source
nor HTML; the separate preview origin serves the opaque document.
