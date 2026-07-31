# WikiOne

WikiOne is an Overleaf-style online editor for MediaWiki wikitext. It combines
a responsive source/compiled-page workspace with local drafts, first-party
WikiOne accounts, source review, latest-revision checks, and three-way conflict
resolution for an English Wikipedia MVP.

## Public-beta candidate capabilities

- Side-by-side source and target-rendered page panes, continuously recompiled
  after edits; narrow screens use accessible Source/Preview tabs.
- Independent wikitext highlighting, diagnostics, outline, snippets,
  autocomplete, and toolbar commands built on permissively licensed CodeMirror
  core packages.
- Wikipedia parser fidelity for images, tables, math, references, audio/video,
  styles, and ResourceLoader modules inside an isolated preview origin.
- Source/base-snapshot IndexedDB drafts with autosave, restore, remote/local
  choice, discard, and lossless conflict input.
- First-party username/password accounts in PostgreSQL with scrypt hashes,
  encrypted Redis sessions, CSRF/Origin protection, refresh, logout/logout-all,
  identity/profile/password controls, and deletion.
- User-facing connected-app and privacy pages that distinguish WikiOne identity
  from Wikimedia authorization.
- Semantic line diff, required edit summary, minor/watchlist choices,
  latest-revision create/update preflight, and explicit mine/latest/manual
  three-way conflict resolution.
- A fake-tested publisher boundary covering create-only/update safeguards,
  post-write revision verification, and normalized AbuseFilter/CAPTCHA errors.
- Non-root, read-only OCI images; reproducible runtime comparison; OpenAPI drift
  checks; source/image scans; SPDX SBOM/provenance output; and signed immutable
  GHCR release manifests.
- Validated AWS Terraform for exact app/API/preview domains, private Fargate,
  managed PostgreSQL with a migration-gated least-privileged API role,
  IAM-authenticated Redis, TLS/CSP, KMS-encrypted configuration records,
  dashboards, synthetics, alerts, and rollback.
- A protected GitHub OIDC deployment workflow that requires a successful exact
  staging canary before production promotion and restores the complete prior
  signed manifest on apply or public-probe failure.

Public Wikimedia OAuth approval is still required. Wikimedia connection and
real publishing remain hard-disabled: the UI explains the gate, placeholder
routes return 503, and the runtime has no authenticated MediaWiki write adapter.
Moegirlpedia remains outside the English Wikipedia MVP.

The repository is deployable but does not itself prove a live public service.
Public beta still requires project-owned AWS/DNS/secrets, signed public images,
real deployment/alert/restore/rollback evidence, manual accessibility sign-off,
and a monitored security contact. WikiOne is released under the MIT License; see
[ADR 0008](docs/decisions/0008-mit-source-release-supersedes-gpl-request.md).

## Quick start

Requirements: Node.js 24 or newer, pnpm 11, PostgreSQL 17, and Redis 7.

```sh
pnpm install
docker compose up postgres redis -d
pnpm dev
```

Open `http://127.0.0.1:5173`. The API and isolated preview service listen on
ports 3000 and 4174. Alternatively, build and start the complete stack:

```sh
docker compose up --build --wait
pnpm test:local:milestone3
```

Compose binds the editor, API, preview, PostgreSQL, and Redis ports to loopback
only. `pnpm test:local:milestone3` exercises Redis outage and recovery, runs the
production-image acceptance flow, creates and deletes a temporary first-party
account, performs one anonymous live Wikipedia compilation, and proves an
isolated PostgreSQL backup/restore. It never submits an edit or changes the
running account database.

Run repository and browser gates with:

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:live` intentionally contacts Wikimedia to reproduce the pinned
rendering-fidelity baseline; ordinary tests do not contact or edit any wiki.

See [development setup](docs/development.md), the
[deployment guide](docs/deployment.md), the
[Milestone 3 checklist](docs/milestone-3-checklist.md), the
[Milestone 3 local-product audit](docs/evidence/milestone-3-audit-2026-07-31.md),
and the
[documentation index](docs/README.md).

## License

WikiOne is available under the [MIT License](LICENSE). The wikitext editor was
implemented independently; no Wikimedia CodeMirror extension source is copied
or adapted. Milestone 2's text algorithms use the compatible MIT-licensed
`node-diff3` and BSD-3-Clause-licensed `diff` packages, so changing WikiOne's
license is neither required nor recommended for this architecture.
