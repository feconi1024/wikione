# Milestone 3 local-product audit record

- Date: 2026-07-31
- Branch: `codex/milestone-3-local-completion`
- Implementation head: `7066d76`
- Host: Windows 11 x64
- Toolchain: Node.js 24.15.0, pnpm 11.9.0, Docker 29.6.1,
  Docker Compose 5.3.0, Buildx 0.35.0, Playwright 1.61.1, and Terraform
  1.15.7 in `hashicorp/terraform:1.15.7`

This record supersedes the 2026-07-28 audit. It distinguishes the locally
runnable product and repository engineering, which pass, from public-beta
operations that require project-owned cloud resources, domains, contacts, or
human testers and therefore remain open.

## Outcome

WikiOne is a functional Milestone 3 product for local use. The production
images start as a health-gated, loopback-only Compose stack; the editor can
load and continuously compile English Wikipedia wikitext into the isolated
preview origin; local drafts and first-party WikiOne accounts work; and the
acceptance gate proves account deletion and credential revocation. A Redis
outage/recovery drill and an isolated PostgreSQL backup/restore drill also pass.

Wikimedia OAuth and upstream writes remain deliberately disabled pending
Wikimedia consumer approval and a separate authenticated adapter review. This
local product can prepare and review an edit, but it cannot publish to
Wikipedia. Moegirlpedia remains post-MVP.

## Executed gates

| Command                                                | Result                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` with `POSTGRES_INTEGRATION_URL`           | Passed: Prettier, ESLint, all 14 package typechecks, scripts/security/E2E typechecks, 34 test files, and 145 tests with no skip        |
| `pnpm build`                                           | Passed: all 14 build tasks                                                                                                             |
| `pnpm test:a11y`                                       | Passed: 16 desktop/mobile checks, including 320 CSS px reflow and forced colors, with no serious or critical axe finding               |
| `pnpm test:browser`                                    | Passed: 50 tests across Chromium, Firefox, WebKit, mobile Chromium, and mobile WebKit                                                  |
| `pnpm test:visual`                                     | Passed: 2 desktop/mobile cases covering 16 committed snapshots without unexplained drift                                               |
| `pnpm test:security`                                   | Passed: 7 application/workflow tests; source audit scanned 71 files with 0 findings                                                    |
| `pnpm audit --prod --audit-level high`                 | Passed: no known vulnerabilities                                                                                                       |
| `pnpm test:compat`                                     | Passed: 20 MediaWiki client and render-fixture tests                                                                                   |
| `pnpm test:live`                                       | Passed: 4 sequential anonymous read-only fixtures with 0 failures                                                                      |
| `pnpm test:load`                                       | Passed: 28,176 requests in 8 seconds with 8 workers, 0 errors, p95 4.25 ms, and p99 5.96 ms; password scrypt p95 540.24 ms             |
| `pnpm test:local:milestone3`                           | Passed: bounded Redis failure/recovery, all 8 real-stack checks, anonymous live Wikipedia compilation, and isolated PostgreSQL restore |
| `pnpm openapi:check`                                   | Passed: the committed OpenAPI 3.1 artifact exactly matches the API document                                                            |
| `pnpm build:reproducible`                              | Passed: both clean OCI builds produced identical IDs for `api`, `preview`, and `web`                                                   |
| `pnpm container:smoke`                                 | Passed: builds current-source local images, then verifies labels, non-root users, health checks, and read-only runtime configuration   |
| `docker compose config --quiet`                        | Passed                                                                                                                                 |
| `docker buildx bake --check`                           | Passed without warnings                                                                                                                |
| Terraform `fmt`, `init -backend=false`, and `validate` | Passed with `aws` 6.53.0 and `archive` 2.7.1                                                                                           |

The reproducibility run reported these image IDs:

- `api`: `sha256:597dda2afc1f99b20b79ae322810d4de6546e4f286f9e5d4c84d9adff4d77f48`
- `preview`: `sha256:b8f855cedb7ed04bab1e1e2e224bb72c3472fb24221140eee506a0fb2e9a6d52`
- `web`: `sha256:319c790fb9115c80cffb43cc120fc6dcd70388d98ed5edb5b6d42094821da50a`

## Retained machine-readable evidence

- [Compatibility matrix](milestone-3-compatibility-2026-07-31.json): 4
  fixtures, 0 failures; English Wikipedia is supported, while Chinese and
  Arabic Wikipedia are compatibility targets.
- [HTTP load](milestone-3-load-2026-07-31.json): 28,176 requests, 0 errors,
  p95 4.25 ms, and p99 5.96 ms against 750 ms and 1,500 ms budgets.
- [Password load](milestone-3-password-load-2026-07-31.json): production
  scrypt parameters and p95 540.24 ms against a 2,500 ms budget.
- [Local restore](milestone-3-restore-2026-07-31.json): a 3,735-byte backup,
  352.24 ms backup, 310.87 ms restore, restored migration and synthetic
  account, and an unchanged running account database.

The reports contain no fetched source, rendered HTML, credentials, cookies,
tokens, or personal data.

## Defects found and fixed during the July 31 audit

- Replaced the unsafe, outdated post-incident Trivy action chain with
  known-safe SHA-pinned Aqua setup/action releases, asserted Trivy 0.69.3, and
  added a workflow supply-chain regression gate (`ad3f056`).
- Added deterministic 320 CSS px and forced-colors/focus accessibility gates
  and made CI run the real desktop/mobile accessibility matrix (`b0275b4`,
  `e9dc7c8`).
- Stopped roughly 1.9 GiB of local worktrees, dependencies, build outputs, and
  Terraform caches entering OCI build contexts; repaired offline workspace
  deployment and target-neutral loopback runtime configuration (`3ddd330`).
- Bound stalled API/preview dependency checks to one second, made Redis
  readiness fail fast during reconnects, and added an outage/recovery drill
  (`e9dc7c8`).
- Made CI run the real PostgreSQL migration/least-privilege integration test
  and made root typechecking include scripts, security tests, and E2E tests
  (`e9dc7c8`).
- Added an isolated, self-cleaning PostgreSQL backup/restore gate with retained
  machine-readable evidence (`dda73cd`).
- Corrected the desktop preview grid so a warning-free compiled document fills
  its pane instead of collapsing to the iframe's intrinsic 150-pixel height;
  browser geometry coverage prevents recurrence (`b5d821f`).
- Patched newly disclosed HIGH-severity transitive `fast-uri` and
  `find-my-way` vulnerabilities and confirmed a clean production dependency
  audit (`70efc6e`).
- Made `pnpm container:smoke` build the current tree when explicit release
  images are not supplied and constrained that local runnable build to the
  host's AMD64 platform (`7066d76`).

The defects repaired during the earlier July 28 audit remain documented in
[the retained audit](milestone-3-audit-2026-07-28.md).

## Locally runnable release

From a checkout with Node.js 24, pnpm 11, and Docker Desktop:

```sh
pnpm install --frozen-lockfile
docker compose up --build --wait
pnpm test:local:milestone3
```

Open the editor at `http://127.0.0.1:5173`. The API is available at
`http://127.0.0.1:3000`, and the cookie-free preview origin is
`http://127.0.0.1:4174`. PostgreSQL and Redis are also bound to loopback only.

## Not completed: external public-beta gates

These items cannot be completed by changing or running this checkout alone and
remain unchecked in [the completion checklist](../milestone-3-checklist.md):

- human NVDA/Chrome, VoiceOver/Safari on macOS and iOS, actual 200%/400% zoom,
  keyboard-only, and Windows High Contrast sign-off;
- published, scanned, SBOM-described, signed OCI images at immutable registry
  digests, with release provenance;
- provisioned cloud infrastructure, public domains, managed TLS, and probes of
  deployed CSP/security headers;
- a managed PostgreSQL point-in-time restore and versioned configuration/state
  restore; the local PostgreSQL restore is evidence for only the repository
  part of this requirement;
- delivered dashboard/alert notifications and exercised deployed canary,
  automatic rollback, and operator rollback;
- independent execution of the deployment/operator guide and deployed
  incident, dependency, certificate, backup, and rollback runbooks;
- a monitored private security contact and approved operator notification
  channel;
- a public source tag/release with notices, SBOMs, digests, and provenance; and
- Wikimedia OAuth consumer approval and the later authenticated write-adapter
  security review.

The source artifact remains MIT-licensed under the repository owner's standing
instruction and [ADR 0008](../decisions/0008-mit-source-release-supersedes-gpl-request.md).
The earlier plan's GPL wording does not authorize relicensing and is satisfied
as complete corresponding source under MIT.
