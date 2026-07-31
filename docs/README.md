# WikiOne documentation

This directory contains the product and engineering record for WikiOne.

- [Contributor guide](../CONTRIBUTING.md) defines change design, repository
  standards, required gates, and review expectations.
- [Security policy](../SECURITY.md) defines supported versions, private
  reporting, priorities, and response handling.
- [Architecture](architecture.md) describes the application, AWS runtime, and
  signed release/deployment control planes.
- [Wikitext editor](wikitext-editor.md) records the independent language layer,
  supported editing behavior, compatibility limits, and licensing boundary.
- [API contracts](api-contracts.md) documents implemented routes, shared wire
  shapes, limits, and the OAuth placeholder.
- [Development](development.md) covers local services, tests, live validation,
  containers, and repository conventions.
- [Threat model](threat-model.md) records application, cloud, supply-chain, and
  rollback controls plus residual risks.
- [Privacy notice](privacy.md) inventories browser drafts, preview traffic,
  ephemeral render data, and current retention.
- [Wikimedia API policy](api-usage-policy.md) is the upstream-traffic operator
  checklist.
- [Fidelity baseline](fidelity-baseline.md) records pinned target-rendering
  evidence.
- [Accessibility](accessibility.md) defines the WCAG target, automated coverage,
  and required human assistive-technology sign-off.
- [Browser support](browser-support.md) defines the tested public-beta engine
  versions, feature matrix, and support boundaries.
- [Deployment and operator guide](deployment.md) defines AWS bootstrap,
  protected environments, exact runtime configuration, canary/promotion,
  backup, alert, and evidence procedures.
- [Release process](release-process.md) defines candidate freeze, signing,
  staging canary, production promotion, publication gates, and rollback.
- [Reproducible builds](reproducible-builds.md) defines clean-checkout,
  application, OCI, OpenAPI, and release-evidence reproduction.
- [Operations runbook](runbook.md) covers incident triage, key rotation,
  alerts, rollback, restore drills, and post-incident evidence.
- [Supported-feature matrix](supported-feature-matrix.md) distinguishes working,
  fixture-only, gated, unsupported, and externally unproven capabilities.
- [Release evidence](evidence/) contains source-free machine-readable audit
  records retained with the repository.
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
- [Milestone 3 local-product audit](evidence/milestone-3-audit-2026-07-31.md)
  records the final locally actionable implementation, exact verification
  results, retained reports, and external public-beta gates.
- [Milestone 1 checklist](milestone-1-checklist.md) maps every deliverable to
  current evidence and verification.
- [Milestone 0 checklist](milestone-0-checklist.md) preserves the preceding
  foundation audit.
- [Architecture decisions](decisions/) explain consequential technical choices.

Documentation is normative when it describes security boundaries or API
contracts. If code and documentation disagree, treat the more restrictive
security behavior as authoritative until the discrepancy is fixed.
