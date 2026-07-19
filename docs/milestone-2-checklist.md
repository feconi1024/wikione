# Milestone 2 completion checklist

Date: 2026-07-19

This audit maps the recovered [Milestone 2 plan](milestone-2-plan.md) to
repository evidence. “Complete” means locally implementable behavior is tested;
Wikimedia-controlled behavior is an explicitly verified nonfunctional
placeholder until public consumer approval.

## Accounts and sessions

- [x] PostgreSQL account migration, normalized unique usernames, display names,
      salted memory-hard password hashes, timestamps, and deletion.
- [x] Registration, generic login failure, session recovery, explicit refresh,
      current logout, logout-all, profile update, password change/revocation,
      and password-confirmed account deletion.
- [x] Random opaque cookie/CSRF values, HMAC Redis lookups/indexes, AES-256-GCM
      session envelopes, 30-minute idle/eight-hour absolute expiry, atomic
      rotation, retired-token replay family revocation, and concurrent-refresh
      rejection.
- [x] Exact-Origin credentialed CORS and per-session CSRF protection on every
      cookie-authenticated mutation; constrained HTTP-only host cookies and
      no-store responses.
- [x] Identity display, responsive authentication dialog, account/security
      controls, session refresh/logout, and destructive confirmation.
- [x] Email is not collected; verification and automated password recovery are
      explicitly not part of the initial first-party lifecycle.

Evidence: `packages/auth-core`, `packages/auth-store`, `apps/api/src/auth-routes.ts`,
their Vitest suites, and the Playwright account scenario.

## Review, preparation, and conflicts

- [x] Exact base source/revision retained in backward-compatible browser drafts.
- [x] Bounded line review with semantic added/removed markup, statistics, and
      required edit summary.
- [x] Minor-edit and preferences/watch/unwatch/nochange watchlist choices.
- [x] Anonymous latest-revision classification for unchanged, changed, created,
      and missing pages.
- [x] Safe create/update preparation plus page-created/page-deleted/revision
      conflict results.
- [x] Three-way merge automatically combines non-overlap and exposes every
      overlap with keep-mine/use-latest/manual resolution.
- [x] Resolved source returns through local save and current preview before a
      later review.
- [x] Publisher port constructs create-only/new and guarded update intents and
      verifies exact source/revision after a fake successful write.
- [x] Safe error union and presentation/guidance cover edit conflict,
      AbuseFilter, CAPTCHA, protection, permission, rate limit, bad token,
      read-only wiki, and verification failure.

Evidence: `packages/publishing-core`, revision/publish-preparation API tests,
`PublishReviewDialog.vue`, and Playwright review/conflict scenarios.

## Wikimedia external gate

- [x] WikiOne and Wikimedia identities use separate contracts and UI states.
- [x] Connected-app page says no Wikimedia account is connected and disables the
      connect control.
- [x] OAuth start/callback placeholders return `503
wikimedia-oauth-unavailable` and start no redirect or token exchange.
- [x] `/v1/publish` returns the same gate and performs no MediaWiki call.
- [x] Runtime has no Wikimedia client ID/secret/token fields, authenticated
      Action API adapter, or edit method.
- [x] Public release remains blocked on production domain/TLS, operator
      privacy/security readiness, consumer submission and approval, secret/token
      design, and a new live-adapter review.

The externally controlled popup/redirect, token refresh/revocation, real direct
create/update, live AbuseFilter/CAPTCHA response, and live revision verification
cannot be activated under the milestone restriction. Their contracts, provider
boundary, UI states, and fake tests are complete placeholders, not simulated
production claims.

## User-facing privacy and operations

- [x] `/connected-apps` and `/privacy` are responsive, direct-loadable routes.
- [x] Privacy inventory covers account records, password hashes, encrypted
      sessions, drafts/base sources, previews, upstream requests, logs, controls,
      and the absent Wikimedia data.
- [x] Compose health-gates PostgreSQL and Redis, persists accounts, keeps Redis
      ephemeral, and supplies clearly marked local-only session keys.
- [x] Public deployment requirements cover managed keys, HTTPS/Secure cookies,
      private data services, backup/retention, shared limits, contact, and
      incident response.
- [x] Architecture, API, threat, OAuth, development, README, ADR, and changelog
      agree with implemented behavior.

## Verification record

Required final commands:

```sh
pnpm check
pnpm build
pnpm test:e2e
docker compose config --quiet
pnpm test:live
```

The first four are release gates. `test:live` is an intentional, read-only
network audit of rendering fixtures and may be reported separately if Wikimedia
is unreachable. No command in the audit submits an edit.
