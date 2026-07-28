# Milestone 3 browser hardening evidence

- Date: 2026-07-19
- Host: Windows x64
- Node.js: 24.15.0
- pnpm: 11.9.0
- Playwright: 1.61.1

Pinned engines reported by `pnpm exec playwright install --dry-run`:

- Chromium 149.0.7827.55, revision 1228;
- Firefox 151.0, revision 1532;
- WebKit 26.5, revision 2311.

## Results

| Command                                                                     | Result                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm test:a11y`                                                            | 14 passed across desktop/mobile Chromium; no serious or critical axe findings          |
| `pnpm test:browser`                                                         | 45 passed across desktop Chromium, Firefox, WebKit, mobile Chromium, and mobile WebKit |
| `pnpm test:visual`                                                          | 2 project tests passed; 16 reviewed surface assertions matched their baselines         |
| `pnpm exec vitest run packages/editor-core/src/preview-coordinator.test.ts` | 2 passed, including explicit superseded-request abort and late-result rejection        |
| `pnpm exec tsc -p e2e/tsconfig.json`                                        | Passed                                                                                 |

The expansion exposed and fixed insufficient diff line-number contrast, a
non-focusable diff scroller, and an unnecessary mobile WebKit summary scroller.
Cookie storage/removal passed on all engines. WebKit reports `SameSite=None` for
the intercepted mock response even when its test header says `Strict`; the
actual API cookie flags are therefore proved by Fastify integration tests, not
by route-interception metadata.

The human screen-reader, browser-zoom, and forced-colors sign-off remains
explicitly outstanding in [the accessibility checklist](../accessibility.md).
