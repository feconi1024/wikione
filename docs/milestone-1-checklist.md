# Milestone 1 completion checklist

This checklist maps the Milestone 1 editor/preview objective to current
repository evidence. OAuth remains intentionally unavailable until external
registration is ready.

| Requirement                                       | Evidence                                                                                       | Status   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| Independent, user-friendly wikitext module        | `packages/wikitext-editor`, editor ADR/document, lexer/analyzer/command tests                  | Complete |
| Responsive source and preview workspace           | `apps/web`, desktop splitter, keyboard separator, mobile tabs, Chromium tests                  | Complete |
| Continuous recompilation after edits              | 650 ms `PreviewCoordinator`, cancellation/revision tests, end-to-end request/iframe assertion  | Complete |
| Stale/failing previews do not replace good output | Monotonic stale-result unit test and browser last-good-preview test                            | Complete |
| Target-faithful media and article rendering       | Action API parser HTML/modules/`modulestyles`, preview document, pinned media baseline         | Complete |
| Anonymous Wikipedia page loading                  | Fixed `en-wikipedia` registry, `/v1/pages/source`, existing/new/non-wikitext tests             | Complete |
| Source-only local drafts                          | IndexedDB adapter, restore/version-choice/discard UI, unit and reload tests                    | Complete |
| Isolated, expiring preview delivery               | Redis/memory stores, opaque IDs, two-minute TTL, `apps/preview`, CSP/header/expiry tests       | Complete |
| Safe anonymous API boundary                       | Fixed hosts, HTTPS client, size limits, CORS allowlist, rate limit, safe errors, OpenAPI tests | Complete |
| Authentication remains a placeholder              | Disabled UI, constant `/v1/auth/availability`, no cookies/tokens/session/write routes          | Complete |
| English Wikipedia MVP                             | Registry and integration path enable only English Wikipedia                                    | Complete |
| Accessibility and responsive verification         | Named editor textbox, AA contrast fixes, axe/keyboard/mobile Playwright checks                 | Complete |
| Reproducible development and deployment baseline  | Root dev scripts, web/API/preview Docker targets, health-gated Compose, CI container jobs      | Complete |
| Engineering quality gates                         | `pnpm check`, 51 offline tests, 10 type-check/build targets, and 3 Chromium tests              | Complete |

## Deliberately deferred

- OAuth registration, callbacks, tokens, sessions, logout, authenticated API
  calls, publishing, edit summaries/diffs, conflicts, and watchlist controls.
- Moegirlpedia discovery, parser certification, authentication, and writes.
- Template-aware semantic language services, full VisualEditor parity, and
  local MediaWiki parsing.
- Public production domains, shared adaptive upstream queues, read-only asset
  proxying, deployment secret management, and pixel-diff visual baselines.

These are later-milestone deliverables, not partially enabled Milestone 1 paths.
