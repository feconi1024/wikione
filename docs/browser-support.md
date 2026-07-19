# Browser support policy

The public beta supports only the engine/version combinations continuously
exercised by the pinned Playwright release. Older versions and unlisted
browsers are best effort because WikiOne depends on modern IndexedDB, Fetch,
AbortController, ES modules, CSS grid, and contenteditable behavior.

## Verified minimums for the 2026-07-19 release candidate

| Surface         | Automated profile | Verified engine        | Policy                                       |
| --------------- | ----------------- | ---------------------- | -------------------------------------------- |
| Desktop Chrome  | Desktop Chrome    | Chromium 149.0.7827.55 | Supported at 149 or newer                    |
| Desktop Firefox | Desktop Firefox   | Firefox 151.0          | Supported at 151 or newer                    |
| Desktop Safari  | Desktop Safari    | WebKit 26.5            | Supported at Safari/WebKit 26.5 or newer     |
| Android Chrome  | Pixel 7           | Chromium 149.0.7827.55 | Supported at Chrome 149 or newer             |
| iPhone Safari   | iPhone 15         | WebKit 26.5            | Supported at iOS Safari/WebKit 26.5 or newer |

The matrix is produced by `@playwright/test` 1.61.1. Microsoft Edge and other
Chromium derivatives are expected to work but are not supported until a named
profile joins CI. Firefox for Android, embedded webviews, browsers with
JavaScript disabled, and Internet Explorer are unsupported.

## Compatibility gate

`pnpm test:browser` runs the same deterministic flow on all five profiles and
currently covers:

- side-by-side editing, mobile source/preview switching, pane resizing, and
  instant recompilation with last-good-preview retention;
- composed Chinese, Arabic, emoji, and plain-text input through CodeMirror;
- IndexedDB source-only draft save/recovery and explicit source preservation;
- credentialed first-party session cookie storage/removal, with cookie flags
  separately asserted against the real Fastify API;
- superseded-request cancellation and late-response rejection;
- isolated preview iframe navigation, focus entry/return, modal trapping,
  reduced motion, account routes, publish review, and conflict resolution;
- responsive overflow checks and serious/critical axe checks in every release
  state.

Service workers are deliberately blocked because the MVP does not ship one.
Target-generated wiki pages are not pixel baselines; deterministic preview
fixtures test the integration while the sequential live compatibility gate
tests current MediaWiki output separately.

## Version changes

When Playwright changes an engine revision, update this policy and retain the
new command evidence. A regression in a supported engine blocks release unless
the project owner explicitly removes that engine in a documented breaking
policy change.
