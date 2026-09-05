# Changelog

All notable changes to WikiOne are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Local preview recovery — 2026-09-05

- Diagnosed the unavailable live preview as stopped local API and preview
  services; restored the complete Compose stack and verified real browser
  editing through Wikipedia's parser into the visible isolated preview.
- Documented frontend-only startup limitations, service readiness checks, and
  detached full-stack startup to prevent confusion with mocked browser tests.

### Interface redesign — 2026-09-05

- Replaced the gradient header, paper textures, and raised panels with flat
  white/charcoal surfaces, fine borders, and a shared blue accent palette.
- Separated global navigation from page loading and review controls, added
  direct editor/connections/privacy navigation, and refined mobile reflow.
- Added System, Light, and Dark appearance preferences with local persistence
  and live operating-system theme updates; storage restrictions do not prevent
  theme selection.
- Coordinated editor syntax, selection, autocomplete, account pages, dialogs,
  diffs, warnings, and status indicators across both themes. Target-rendered
  wiki content retains its original site styling in the isolated preview.
- Added appearance persistence, storage-failure, and dark-mode accessibility
  browser coverage, refreshed light visual baselines, and added dark editor,
  authentication, and review baselines for desktop and mobile.

### Added

- A loopback-only `pnpm test:local` acceptance gate for the real Compose stack,
  covering runtime CSP/CORS, dependency readiness, OpenAPI, PostgreSQL accounts,
  Redis sessions, live Wikipedia compilation, isolated preview delivery,
  disabled publishing, account deletion, and credential revocation.
- A self-recovering local Redis outage drill that proves liveness/readiness
  semantics and reruns the real-stack acceptance gate after recovery.
- An isolated PostgreSQL backup/restore drill that uses only the current schema
  and a synthetic account, verifies the restored migration/data records, and
  leaves the running local account database unchanged.
- Automated 320 CSS-pixel reflow and forced-colors accessibility coverage plus
  a repository security regression test that rejects mutable GitHub Action
  references and unsafe or implicitly installed Trivy versions.
- Milestone 3 hardening/public-beta plan and evidence-first completion
  checklist.
- ADR 0008 settling the source license: MIT is authoritative, and the
  milestone's source-release artifact is delivered as complete corresponding
  source under MIT rather than by relicensing. It supersedes ADR 0004 and
  retains the boundary against copying Wikimedia's GPL CodeMirror extension.
- A superseding July 31 Milestone 3 local-product audit with retained load,
  compatibility, and PostgreSQL restore evidence, exact verification results,
  repaired defects, local startup instructions, and every public-beta gate
  still unmet for want of cloud credentials, a registry, a live domain,
  approved contacts, or a human tester.
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
- An atomic Redis-backed API rate-limit store that shares privacy-preserving
  counters across Fargate tasks and participates in readiness checks.
- A migration-gated PostgreSQL application role whose AWS-generated password
  uses Terraform ephemeral/write-only values and never enters Terraform state;
  the long-running API no longer receives the RDS master credential.
- Validated AWS infrastructure as code for exact app/API/preview domains,
  private Fargate workloads, managed PostgreSQL and IAM-authenticated Redis,
  managed TLS, KMS-encrypted configuration records, synthetic monitoring,
  dashboards, alerts, and readiness-driven rollback.
- A protected GitHub OIDC deployment workflow that verifies signed public GHCR
  digests, plans by immutable manifest, smoke-tests canary and promoted
  releases, persists the last-known-good record, and restores all services
  together after a failed apply or public probe.
- Contributor and security policies plus executable deployment, release,
  reproducibility, operations, and supported-feature documentation for the
  public-beta candidate.

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
- CI now gates every push on gitleaks, Trivy vulnerability/secret/license
  scanning, the source-boundary audit, and the container hardening checks.
  Previously those ran only in the tag-triggered release workflow, or nowhere.

### Fixed

- API and preview readiness checks now fail closed within one second when a
  dependency stalls; Redis adapters reject reconnecting clients immediately
  instead of queuing `PING` indefinitely during an outage.
- CI now runs the real PostgreSQL migration/least-privilege integration test
  and the desktop/mobile accessibility matrix instead of silently skipping the
  database path and exercising only desktop Chromium.
- The root typecheck now includes operational scripts, security tests, and
  Playwright tests; the local acceptance JSON guard was corrected after this
  expanded gate exposed its previously unchecked narrowing error.
- The desktop compiled-preview iframe now occupies the flexible pane row when
  no parser-warning element exists; explicit grid placement prevents the
  intrinsic 150-pixel iframe row from expanding the status bar over the pane.
- Lockfile overrides move vulnerable transitive `fast-uri` and `find-my-way`
  releases to their fixed versions after the CI filesystem scan identified
  three newly published HIGH-severity findings.
- `pnpm container:smoke` now builds current-source smoke images when explicit
  image references are absent, preventing a local release claim from silently
  testing stale tags left by an earlier run.
- OCI builds recursively exclude local worktrees, dependency/build artifacts,
  and Terraform provider caches instead of copying roughly 1.9 GiB of local
  auxiliary data into every application image layer.
- Development Compose ports bind to loopback so local-only account, session,
  API, preview, and editor services are not exposed to the LAN.
- The web image accepts exact HTTP localhost origins only when Compose sets an
  explicit local-development opt-in; production keeps the HTTPS-only default.
- OCI builds install every workspace manifest up front, persist pnpm security
  metadata across retries, verify the native Turbo binary, deploy production
  dependencies offline from the verified store, and disable build telemetry
  instead of triggering a second implicit install.
- Local checks ignore Git-excluded agent and editor metadata, including nested
  `.claude` worktrees, so `pnpm check` evaluates only the WikiOne checkout and
  does not fail on another tool's independent TypeScript project.
- GitHub CI and release scans no longer depend on the broken pre-incident
  Trivy action chain. Workflows now use Aqua's post-incident known-safe
  SHA-pinned `setup-trivy` 0.2.6 and `trivy-action` 0.35.0 releases, assert the
  immutable Trivy 0.69.3 binary, and prevent nested scanner setup.
- `pnpm check` failed at the lint step: the password benchmark imported the
  `@wikione/auth-core` build output, which does not exist when lint and
  typecheck run before any build. It now imports the package source entry point.
- The five-engine browser suite was intermittently red. WebKit needs up to 26 s
  for the CodeMirror surface against a 30 s budget the other engines clear in
  under 10 s, so host contention produced spurious compatibility failures.
  WebKit projects now carry their own timing budgets.
- Architecture and threat-model documentation now covers the AWS runtime,
  signed supply chain, protected promotion, configuration-only retention,
  rollback controls, and explicitly unproven external state.
