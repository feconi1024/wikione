# Changelog

## Unreleased

### Added

- Milestone 3 hardening/public-beta plan and evidence-first completion
  checklist, including an explicit MIT/GPL governance decision gate.
- Dedicated accessibility, five-engine browser-compatibility, and deterministic
  desktop/mobile visual-regression gates with reviewed baselines.

### Changed

- Modal dialogs now trap and restore keyboard focus, mobile account controls
  retain an accessible name, CodeMirror uses a WCAG-AA token palette, and its
  scroll region is keyboard reachable in WebKit.
- The web development server resolves workspace packages directly to source so
  browser tests and local edits cannot use stale package builds.

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
