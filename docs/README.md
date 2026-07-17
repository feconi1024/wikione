# WikiOne documentation

This directory contains the product and engineering record for WikiOne.

- [Architecture](architecture.md) describes the current Milestone 0 system and
  the boundaries reserved for later milestones.
- [API contracts](api-contracts.md) documents the stable public shapes and
  error model.
- [Development](development.md) covers local setup, checks, live validation,
  containers, and repository conventions.
- [Threat model](threat-model.md) records trust boundaries and required
  mitigations.
- [Privacy notice](privacy.md) documents data handling for the spike and the
  planned public service.
- [Wikimedia API policy](api-usage-policy.md) is the operator checklist for
  responsible upstream access.
- [Fidelity baseline](fidelity-baseline.md) records pinned live-render evidence.
- [OAuth registration](oauth-registration.md) contains the external setup that
  cannot be completed from the repository.
- [Milestone 0 checklist](milestone-0-checklist.md) maps every planned
  deliverable to evidence.
- [Architecture decisions](decisions/) explain consequential technical choices.

Documentation is normative when it describes security boundaries or API
contracts. If code and documentation disagree, open an issue and treat the more
restrictive security behavior as authoritative until the discrepancy is fixed.
