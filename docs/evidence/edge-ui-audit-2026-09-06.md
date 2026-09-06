# Edge UI audit — 2026-09-06

The installed Microsoft Edge 152.0.4191.62 passed 22 desktop browser tests
and a separate live walkthrough against the rebuilt local Compose stack.
The Computer Use runtime failed to initialize on this host, so the audit
used Playwright with the installed Edge channel in headed mode and an
isolated profile. This was automated browser interaction plus screenshot
inspection, not a native Computer Use manual walkthrough.

## Defects found and fixed

| Defect                                                                 | Correction                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Loaded-page autosave raised an IndexedDB clone error.                  | Store plain base-revision metadata instead of a Vue reactive proxy.                            |
| Typing a destination page could overwrite its saved draft.             | Separate requested page inputs from the active document; flush pending edits before switching. |
| Clearing all source left a stale compiled page visible.                | Clear preview state when the source becomes empty.                                             |
| Manual conflict resolution had an ambiguous control label.             | Give the radio and textarea separate labels.                                                   |
| Rendered article links requested tabs that the iframe sandbox blocked. | Permit sandboxed popups while retaining isolation and no-opener links.                         |
| Citation and backlink fragments opened the upstream base URL.          | Resolve fragments against the current preview document and navigate within the frame.          |

## Coverage and verification

- All 22 nonvisual Edge tests passed with one worker using
  `pnpm test:edge --headed` (equivalent direct Playwright invocation on this
  host). Coverage includes nine toolbar commands, undo/redo, multilingual
  composition, outline, search, snippets, pointer resizing, page loading,
  draft persistence/restore/replacement/discard, source clearing, preview
  request coalescing and retry, navigation/history, appearance persistence,
  mobile layouts, modal focus, forced colors, accessibility scans, review,
  watchlist and conflict controls, account flows, article links and citations.
- Four targeted mobile Chromium checks passed: toolbar, outline/search,
  article links and citation/backlink navigation. This run does not establish
  a new full Firefox/WebKit or visual-baseline certification.
- The 16 web/editor unit tests and eight preview-document/security tests
  passed. A security timeout during an interrupted/contended run was followed
  by a successful complete eight-test rerun.
- Production build, applicable lint/type checks and formatting checks passed.
- All eight real-stack acceptance checks passed after the final rebuild,
  including readiness, CORS/OpenAPI, local account/session lifecycle,
  disabled publishing, live compilation and credential revocation.
- Account UI tests use synthetic mocked responses. Live acceptance exercises
  a temporary local account and cleans it up. Public Wikimedia publishing
  and OAuth remain disabled and were not exercised against a real account.

## Live walkthrough and efficiency

The live run used the real local API and Wikipedia parser. It verified
headings, bold text, lists, citation/backlink navigation, an article opening
in a separate tab, page loading, loaded-revision autosave, Enter-to-load,
the original local draft after reload, review open/close, appearance, mobile
source/preview switching, privacy navigation and absence of page overflow.
Desktop and mobile screenshots were inspected for layout.

A synthetic source of roughly 2.7 KB produced exactly one preview request
after insertion and became visible in **1,536 ms**. Four preview API response
measurements in this walkthrough were **427, 338, 1,227 and 801 ms**. These
are individual local observations, not latency percentiles or a load-test
claim. A deterministic browser test separately confirms rapid typing is
coalesced into one request after the burst.

Article tabs inherit sandbox restrictions; destination features requiring
additional permissions may remain unavailable. The audit covers the tested
paths and does not claim every possible input or upstream outage is handled.
