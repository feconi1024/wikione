# Release evidence

This directory retains small, reviewable, machine-readable records needed to
audit a release. Reports must not contain fetched wikitext, rendered HTML,
credentials, cookies, tokens, personal data, or secret configuration.

- `milestone-3-compatibility-2026-07-19.json` records the anonymous, sequential,
  read-only Wikipedia compatibility matrix used for the public-beta gate.

Large generated artifacts, raw scans, and local logs remain under the ignored
`artifacts/` directory and are published through the release workflow when
appropriate.
