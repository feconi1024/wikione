# Milestone 3 final audit record

- Date: 2026-07-28
- Branch: `claude/milestone-3-wikitext-editor-4c52b5`
- Host: Windows 11 x64
- Node.js 24.15.0, pnpm 11.9.0, Docker 29.6.1, Terraform 1.15.7 (container
  image `hashicorp/terraform:1.15.7`), Playwright 1.61.1

Every command below was executed on this tree on 2026-07-28. Commands that
require project-owned cloud resources are listed separately as unmet external
gates; none of them are recorded as passing.

## Executed gates

| Command                                                | Result                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm check`                                           | Passed: Prettier clean, ESLint clean, 14 typecheck tasks, 140 tests passed 1 skipped |
| `pnpm build`                                           | Passed, 14 build tasks                                                               |
| `pnpm test:a11y`                                       | 14 passed on desktop and mobile Chromium; no serious or critical axe findings        |
| `pnpm test:browser`                                    | 45 passed across Chromium, Firefox, WebKit, mobile Chromium, and mobile WebKit       |
| `pnpm test:visual`                                     | 2 project tests passed against the committed desktop and mobile baselines            |
| `pnpm test:security`                                   | 5 tests passed; source boundary audit scanned 71 files with 0 findings               |
| `pnpm test:compat`                                     | 20 passed across the MediaWiki client and render-spike fixtures                      |
| `pnpm test:load`                                       | Passed against the isolated Compose stack; see the reports below                     |
| `pnpm test:live`                                       | Passed: 4 sequential anonymous read-only Wikipedia fixtures                          |
| `pnpm openapi:check`                                   | Passed: committed OpenAPI artifact matches the emitted document                      |
| `pnpm build:reproducible`                              | Passed: identical `api`, `preview`, and `web` image IDs across two builds            |
| `pnpm container:smoke`                                 | Passed: non-root users, HEALTHCHECKs, MIT SPDX labels, read-only runtime             |
| `docker compose config --quiet`                        | Passed                                                                               |
| `docker buildx bake --check`                           | Passed: no warnings for `api`, `preview`, or `web`                                   |
| `terraform fmt -check -recursive infra/terraform`      | Passed                                                                               |
| `terraform init -backend=false` + `terraform validate` | Passed: configuration is valid with `aws` 6.53.0 and `archive` 2.7.1                 |
| `tsc -p e2e/tsconfig.json`                             | Passed                                                                               |

## Retained reports

- [Compatibility matrix](milestone-3-compatibility-2026-07-28.json): 4 fixtures,
  0 failures, anonymous read-only, English Wikipedia supported with Chinese and
  Arabic as compatibility targets.
- [HTTP load](milestone-3-load-2026-07-28.json): 23,506 requests across eight
  scenarios at 8 workers for 8 s, 0 errors, aggregate p95 5.20 ms and p99
  7.21 ms against budgets of 750 ms and 1,500 ms.
- [Password load](milestone-3-password-load-2026-07-28.json): production scrypt
  parameters, p95 486.59 ms against a 2,500 ms budget.
- The 2026-07-19 reports are retained for comparison; this run supersedes them.

## Defects found and fixed during the audit

- `pnpm check` failed at the lint step. `scripts/benchmark-password.ts` imported
  the `@wikione/auth-core` build output, which does not exist when lint and
  typecheck run before any build. Fixed in `22bab42`.
- The five-engine browser suite was intermittently red. WebKit needs up to 26 s
  for the CodeMirror surface against a 30 s budget the other engines clear in
  under 10 s, so host contention produced spurious compatibility failures. Fixed
  in `ae2283c`.
- Secret, dependency, and license scanning ran only in the release workflow, and
  neither the source boundary audit nor the container hardening checks ran in CI
  at all. Fixed in `43babfe`.
- The source-license conflict between the product plan and the repository
  instruction was unresolved and blocked the checklist. Settled as MIT by
  [ADR 0008](../decisions/0008-mit-source-release-supersedes-gpl-request.md) in
  `f86f14c`.

## Local environment note

Port 5432 falls inside this host's Hyper-V reserved range (5336–5435), so the
Compose PostgreSQL port could not be published. The load gate was run with a
local-only, uncommitted override that stops publishing the database and cache
ports; the `api` and `preview` ports the gate actually uses were unchanged. This
is a host condition, not a repository defect.

## Unmet external gates

These require project-owned credentials, domains, or a human, and are not
satisfied by this repository. They remain open in
[the checklist](../milestone-3-checklist.md).

- A real staging or production deployment, and therefore live domain, TLS, CSP,
  and header probes against deployed origins.
- Published, signed OCI images at immutable GHCR digests with attached SBOMs and
  provenance. The build, scan, SBOM, signing, and publishing workflow exists and
  is validated, but has not been run against a registry.
- Provisioned dashboards, synthetics, and alerts, plus a confirmed test
  notification to the approved operator channel.
- Executed backup and restore verification for versioned configuration and the
  retained PostgreSQL account store.
- An exercised canary promotion and an actual automatic and operator-triggered
  rollback against a deployed environment.
- Human screen-reader, browser-zoom, and forced-colors sign-off, per the table
  in [the accessibility guide](../accessibility.md).
- A monitored private security contact published for the security policy.
- The public source release tag with release notes, notices, SBOMs, digests, and
  provenance.
- Wikimedia OAuth public consumer approval, which remains a Milestone 2 carry-over
  and keeps upstream publishing disabled.
