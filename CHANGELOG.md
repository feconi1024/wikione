# Changelog

## Unreleased

### Added

- Milestone 3 hardening/public-beta plan and evidence-first completion
  checklist, including an explicit MIT/GPL governance decision gate.
- Dedicated accessibility, five-engine browser-compatibility, and deterministic
  desktop/mobile visual-regression gates with reviewed baselines.
- A complete OpenAPI 3.1 contract with deterministic artifact generation,
  semantic drift detection, and documented request, response, and error shapes.
- A bounded HTTP load gate and production-scrypt concurrency benchmark with
  explicit latency/error budgets and safeguards against Wikimedia targets.
- A focused application-security suite for origin, header, body-limit,
  preview-isolation, and disabled-write boundaries plus a runtime source audit.
- A deterministic target-API contract gate and sequential anonymous live
  compatibility report covering the supported, RTL, and controlled-media
  fixtures without retaining source text.
- Dependency-aware liveness and readiness probes for the API and isolated
  preview service, including bounded load coverage and safe failure responses.
- Browser coverage for composed multilingual input, real HttpOnly cookie
  storage/removal, superseded preview cancellation, complete splitter keys,
  and every public-beta review/error accessibility state.
- Reviewed desktop/mobile visual baselines for account, connected-app,
  publish-review, and preview-error surfaces.
- Pinned, non-root OCI images, multi-platform Bake targets, container smoke and
  reproducibility gates, and a digest-only release contract.
- A release workflow that scans source and every image, emits provenance and
  SPDX SBOMs, signs image digests and deployment manifests, and carries bounded
  canary, promotion, and rollback intent.
- A short-lived ElastiCache IAM credentials provider that signs Redis
  connections with the ECS task role, renews credentials before expiry, and
  retries transient signing failures without persisting tokens or AWS secrets.
- Validated AWS infrastructure as code for exact app/API/preview domains,
  private Fargate workloads, managed PostgreSQL and IAM-authenticated Redis,
  managed TLS, KMS-encrypted configuration records, synthetic monitoring,
  dashboards, alerts, and readiness-driven rollback.
- A protected GitHub OIDC deployment workflow that verifies signed public GHCR
  digests, plans by immutable manifest, smoke-tests canary and promoted
  releases, persists the last-known-good record, and restores all services
  together after a failed apply or public probe.

### Changed

- Modal dialogs now trap and restore keyboard focus, mobile account controls
  retain an accessible name, CodeMirror uses a WCAG-AA token palette, and its
  scroll region is keyboard reachable in WebKit.
- The web development server resolves workspace packages directly to source so
  browser tests and local edits cannot use stale package builds.
- Publish-review line numbers meet WCAG AA contrast, scrollable diffs are
  keyboard reachable, and the mobile review summary wraps without a
  WebKit-only horizontal scroller.
- MediaWiki transport now validates response envelopes and content types,
  rejects redirects, bounds overload retries and `Retry-After`, normalizes
  legacy API shapes, and never exposes upstream response or source text.
- API and preview request telemetry now records only bounded operational
  metadata; request bodies, wikitext, credentials, and client addresses remain
  outside the structured completion logs.
- Production startup now fails closed on plaintext data-store transports,
  non-HTTPS public origins, insecure cookies, and missing trusted-proxy hops.
- The target-neutral web image now receives its validated API origin at runtime,
  while the API consumes the RDS-managed password without requiring a
  pre-provisioned database URL containing a not-yet-created endpoint.
- CI actions are pinned by commit and CI now validates and security-scans the
  Terraform module before building the browser and OCI artifacts.

All notable changes to WikiOne are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Recoverable Milestone 2 authentication and publishing-preparation plan with
  explicit acceptance evidence and Wikimedia OAuth release boundary.
- Architecture decision separating first-party WikiOne identity from future
  Wikimedia connected-app authorization.
- Provider-specific first-party account/session contracts, bounded publishing
  preparation and revision-check contracts, and normalized publish failures.
- Independently tested scrypt password hashing, Unicode username normalization,
  opaque token hashing, AES-256-GCM session encryption, and CSRF comparison.
- First-party authentication domain service with registration, login, session
  rotation/replay handling, logout, logout-all, profile/password updates, and
  account deletion plus PostgreSQL/Redis and in-memory repository adapters.
- Credentialed first-party authentication and account API routes with exact
  origin checks, synchronizer CSRF headers, HTTP-only cookies, rate limits,
  refresh/logout controls, and inert Wikimedia OAuth start/callback routes.
- PostgreSQL-backed account persistence and encrypted Redis sessions in Compose,
  including health-gated startup, durable account storage, and explicit
  development-only key/cookie configuration.
- Browser-safe publishing core with bounded semantic line review, three-way
  merge/conflict resolution, create/update safeguards, post-write verification,
  disabled production publisher, and typed abuse-filter/CAPTCHA/error mapping.
- Anonymous latest-revision checks and publish preparation for safe create,
  update, page-created, page-deleted, and revision-changed states plus an
  explicit non-writing Wikimedia publish endpoint.
- Local drafts now retain the exact base wikitext alongside revision metadata,
  enabling lossless three-way merge while remaining backward compatible with
  Milestone 1 draft records.
- Route-aware Vue account experience with registration/sign-in dialog, identity
  menu, refresh/logout, account security and deletion controls, connected-apps
  status, and an implementation-aligned privacy page.
- Accessible publish-review sheet with semantic text diff, required summary,
  minor/watchlist controls, preview freshness gate, latest-revision readiness,
  explicit three-way conflict choices, provider-error guidance, and a disabled
  approval-pending Wikimedia action.
- Browser coverage for first-party identity separation, account profile/logout,
  semantic review, zero write requests, conflict resolution, Escape/focus
  behavior, responsive privacy/review views, and serious accessibility issues.
- Milestone 2 architecture, API, development, privacy, threat, OAuth, license,
  operations, README, and completion-audit documentation aligned to the
  implemented first-party and approval-gated publishing boundaries.
- Initial pnpm/Turborepo TypeScript workspace.
- CI, formatting, linting, container-development, and test foundations.
- Shared, versioned Zod contracts for wikis, page sources, previews, and
  publishing.
- MediaWiki Action API client for pinned revision retrieval and preview parsing.
- Isolated preview-document assembly with ResourceLoader module bootstrapping.
- Minimal Fastify backend with health, contract metadata, and generated OpenAPI.
- Reproducible API container and Redis development composition.
- Live rendering spike with pinned English, Chinese, and Arabic Wikipedia
  revisions plus a controlled media fixture.
- Cookie-free preview server with sandbox-oriented headers and CSP.
- Architecture decisions, threat model, privacy notice, API-usage checklist,
  OAuth registration worksheet, fidelity baseline, and milestone audit.
- Container build verification on every CI branch push.
- Clean-checkout workspace resolution and Node 24-native actions for Linux CI.
- Authentication handoff and anonymous/authenticated session contracts.
- Independent MIT-licensed wikitext tokenizer, diagnostics, outline,
  completions, formatting commands, and CodeMirror-core integration.
- Framework-independent preview scheduling with debouncing, cancellation, and
  stale-response protection plus versioned local-draft identities.
- Responsive Vue split-pane workspace with a formatting toolbar, navigable
  outline, keyboard-resizable divider, mobile source/preview tabs, and status
  feedback that retains the last successful preview.
- Source-only IndexedDB autosave, restore, remote-version choice, and explicit
  discard controls; authentication is visible but deliberately unavailable.
- Repository hygiene rule excluding generated TypeScript incremental metadata.
- Bounded page/preview contracts, preview expiry metadata, opaque render IDs,
  safe API errors, and an explicit OAuth-registration-pending response.
- Short-lived preview storage with tested in-memory expiry and a Redis adapter.
- Parser requests now include `modulestyles` for complete ResourceLoader CSS.
- Milestone 1 read-only API routes for the fixed English Wikipedia registry,
  page loading, bounded/rate-limited preview compilation, and safe errors.
- Explicit cookie-free OAuth availability placeholder; no sign-in, token,
  session, publishing, or wiki write path is active before registration.
- Dedicated preview-origin service with opaque-ID retrieval, expiry handling,
  strict frame/CSP/permissions headers, no-store responses, and no auth routes.
- Playwright browser coverage for continuous compilation, last-good-preview
  retention, toolbar editing, keyboard pane resizing, IndexedDB restoration,
  serious accessibility violations, and responsive mobile panel switching.
- Accessible naming for the CodeMirror editing surface and WCAG AA contrast
  corrections for muted outline, status-bar, and privacy text.
- Parallel local development commands, separate API/preview/web container
  targets, health-gated Compose wiring, and non-persistent Redis preview data.
- Editor-origin CSP/security headers and complete environment examples without
  premature OAuth secrets or configuration.
- Milestone 1 architecture, API, editor-compatibility, development, completion,
  and decision documentation aligned to the implemented anonymous MVP.
- Current-state privacy inventory, threat model, API-usage checklist, OAuth
  placeholder status, and clarified fidelity-test boundary.
