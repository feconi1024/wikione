# Milestone 0 completion checklist

This checklist maps the approved plan to current repository evidence. Items that
require an external account or deployment decision are prepared but explicitly
not performed.

| Requirement                                                            | Evidence                                                                              | Status                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| Greenfield monorepo and strict engineering baseline                    | Root pnpm/Turborepo/TypeScript/ESLint/Prettier config, CI, `.editorconfig`, lockfile  | Complete                          |
| Required repository files                                              | `README.md`, `.gitignore`, MIT `LICENSE`, `CHANGELOG.md`, `docs/`                     | Complete                          |
| Container development foundation                                       | `Dockerfile`, `compose.yaml`, `.dockerignore`, CI image build                         | Complete                          |
| Shared API contracts                                                   | `@wikione/contracts` Zod schemas and tests                                            | Complete                          |
| Minimal API and OpenAPI                                                | `apps/api`, `/healthz`, `/v1/meta/contracts`, `/openapi.json` tests                   | Complete                          |
| Target-parser client                                                   | `@wikione/mediawiki`, identified POST requests, `maxlag`, timeout, structured errors  | Complete                          |
| Isolated document assembly                                             | `@wikione/preview-document`, safe head metadata extraction, module filtering, CSP     | Complete                          |
| Runnable isolated preview                                              | `apps/render-spike` preview server with manifest allowlist and isolation-header tests | Complete                          |
| English, Chinese, and RTL pinned fixtures                              | Revision IDs in `fixtures.json`; live manifest summarized in fidelity baseline        | Complete                          |
| Images, tables, templates, references, math, audio/video demonstration | Controlled media suite and live structural assertions                                 | Complete                          |
| Architecture decisions and threat model                                | `docs/architecture.md`, `docs/threat-model.md`, ADRs                                  | Complete                          |
| Privacy notice and API policy checklist                                | `docs/privacy.md`, `docs/api-usage-policy.md`                                         | Complete                          |
| Fidelity baseline and known limitations                                | `docs/fidelity-baseline.md`                                                           | Complete                          |
| OAuth application preparation                                          | Exact worksheet and prerequisites in `docs/oauth-registration.md`                     | Prepared; external action skipped |
| Verification                                                           | `pnpm check`, `pnpm build`, and `pnpm test:live` pass                                 | Complete                          |

## Explicitly deferred to later milestones

The Vue split-pane editor, IndexedDB drafts, continuous browser compilation,
Redis sessions, OAuth implementation, publishing, conflict UI, pixel-diff tests,
production infrastructure, and Moegirlpedia provider are not Milestone 0 work.
