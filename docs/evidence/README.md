# Release evidence

This directory retains small, reviewable, machine-readable records needed to
audit a release. Reports must not contain fetched wikitext, rendered HTML,
credentials, cookies, tokens, personal data, or secret configuration.

- `milestone-3-audit-2026-07-28.md` is the final Milestone 3 audit record. It
  lists every executed gate with its result, the defects the audit found and
  fixed, and every gate that remains unmet for want of external resources.
- `milestone-3-compatibility-2026-07-28.json` records the anonymous, sequential,
  read-only Wikipedia compatibility matrix used for the public-beta gate.
- `milestone-3-load-2026-07-28.json` records bounded HTTP load against the
  isolated OCI Compose stack, including both dependency readiness probes.
- `milestone-3-password-load-2026-07-28.json` records bounded concurrent scrypt
  hash/verification latency without retaining credentials or user data.
- `milestone-3-browser-2026-07-19.md` records the exact accessibility,
  five-engine browser, and deterministic visual-regression commands and
  outcomes; it also identifies the remaining human accessibility sign-off.
- The remaining `2026-07-19` reports are retained for comparison against the
  superseding 2026-07-28 run.

Large generated artifacts, raw scans, and local logs remain under the ignored
`artifacts/` directory and are published through the release workflow when
appropriate.
