# Release evidence

This directory retains small, reviewable, machine-readable records needed to
audit a release. Reports must not contain fetched wikitext, rendered HTML,
credentials, cookies, tokens, personal data, or secret configuration.

- `edge-ui-audit-2026-09-06.md` records the installed-Edge audit, six fixes,
  browser coverage, live preview timings, and verification limitations.

- `milestone-3-audit-2026-07-31.md` is the superseding Milestone 3 local-product
  audit record. It
  lists every executed gate with its result, the defects the audit found and
  fixed, and every gate that remains unmet for want of external resources.
- `milestone-3-compatibility-2026-07-31.json` records the anonymous, sequential,
  read-only Wikipedia compatibility matrix used for the public-beta gate.
- `milestone-3-load-2026-07-31.json` records bounded HTTP load against the
  isolated OCI Compose stack, including both dependency readiness probes.
- `milestone-3-password-load-2026-07-31.json` records bounded concurrent scrypt
  hash/verification latency without retaining credentials or user data.
- `milestone-3-restore-2026-07-31.json` records an isolated PostgreSQL
  schema/data backup and restore using one synthetic account, including the
  durable and deliberately excluded data classes.
- The `2026-07-28` audit and reports are retained for comparison against the
  superseding 2026-07-31 run.
- `milestone-3-browser-2026-07-19.md` records the exact accessibility,
  five-engine browser, and deterministic visual-regression commands and
  outcomes; it also identifies the remaining human accessibility sign-off.
- The remaining `2026-07-19` reports are retained for historical comparison.

Large generated artifacts, raw scans, and local logs remain under the ignored
`artifacts/` directory and are published through the release workflow when
appropriate.
