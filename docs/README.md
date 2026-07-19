# WikiOne documentation

This directory contains the product and engineering record for WikiOne.

- [Architecture](architecture.md) describes the implemented Milestone 2
  topology and trust boundaries.
- [Wikitext editor](wikitext-editor.md) records the independent language layer,
  supported editing behavior, compatibility limits, and licensing boundary.
- [API contracts](api-contracts.md) documents implemented routes, shared wire
  shapes, limits, and the OAuth placeholder.
- [Development](development.md) covers local services, tests, live validation,
  containers, and repository conventions.
- [Threat model](threat-model.md) records implemented controls and remaining
  production risks.
- [Privacy notice](privacy.md) inventories browser drafts, preview traffic,
  ephemeral render data, and current retention.
- [Wikimedia API policy](api-usage-policy.md) is the upstream-traffic operator
  checklist.
- [Fidelity baseline](fidelity-baseline.md) records pinned target-rendering
  evidence.
- [OAuth registration](oauth-registration.md) records the future Wikimedia
  setup and its separation from working first-party WikiOne accounts.
- [Milestone 2 plan](milestone-2-plan.md) is the authoritative authentication,
  publishing-preparation, external-gate, and acceptance scope.
- [Milestone 2 checklist](milestone-2-checklist.md) maps that scope to current
  code, tests, and the remaining external approval gate.
- [Milestone 3 plan](milestone-3-plan.md) defines the final hardening,
  deployment, operations, and public-release scope before MVP.
- [Milestone 3 checklist](milestone-3-checklist.md) is the evidence-first public
  beta release gate.
- [Milestone 1 checklist](milestone-1-checklist.md) maps every deliverable to
  current evidence and verification.
- [Milestone 0 checklist](milestone-0-checklist.md) preserves the preceding
  foundation audit.
- [Architecture decisions](decisions/) explain consequential technical choices.

Documentation is normative when it describes security boundaries or API
contracts. If code and documentation disagree, treat the more restrictive
security behavior as authoritative until the discrepancy is fixed.
