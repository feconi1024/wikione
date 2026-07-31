# Milestone 3 completion checklist

Date opened: 2026-07-19
Date audited: 2026-07-31

This checklist is deliberately evidence-first. Leave an item unchecked until
the cited artifact or external state proves the complete requirement. Every
checked item below was re-executed on 2026-07-31 and is recorded in the
[final audit record](evidence/milestone-3-audit-2026-07-31.md).

Unchecked items are not incomplete engineering. Each one needs project-owned
cloud credentials, a registry, a live domain, or a human tester, and none of
them can be satisfied from a repository checkout.

## Hardening suites

- [x] Accessibility automation covers every first-party route, modal, keyboard
      flow, responsive mode, and the isolated preview document as a top-level
      document. `pnpm test:a11y` reports 16 passes with no serious or critical
      axe findings, and [the accessibility guide](accessibility.md) records the
      manual checklist.
- [ ] Human screen-reader, browser-zoom, and forced-colors sign-off is recorded.
      Every row of the sign-off table in [the accessibility guide](accessibility.md)
      is still "not yet recorded"; automation cannot substitute for it.
- [x] Security tests and CI scans cover application, dependencies, secrets,
      licenses, OCI images, headers, isolation boundaries, and disabled writes.
      `pnpm test:security` reports 7 passes and zero source-boundary findings,
      `pnpm audit --prod --audit-level high` reports no known vulnerabilities,
      and CI now
      runs gitleaks, Trivy `vuln,secret,license`, the source audit, and the
      container hardening checks on every push.
- [x] Load/resilience thresholds pass against an isolated release stack without
      sending load to Wikimedia. See the [HTTP](evidence/milestone-3-load-2026-07-31.json)
      and [password](evidence/milestone-3-password-load-2026-07-31.json) reports.
- [x] Chromium, Firefox, WebKit, mobile Chromium, and mobile WebKit pass the
      supported browser suite: 50 passed on 2026-07-31. WebKit projects carry
      their own timing budgets so a slow engine is not misreported as a
      compatibility failure.
- [x] Reviewed desktop/mobile visual baselines pass without unexplained drift.
- [x] MediaWiki contract fixtures and the read-only live compatibility matrix
      pass for every supported target in the
      [compatibility report](evidence/milestone-3-compatibility-2026-07-31.json).

## Deployment and operations

- [x] OCI images are minimal, non-root, health-checked, SPDX-labelled,
      read-only at runtime, and byte-for-byte reproducible. `pnpm container:smoke`
      and `pnpm build:reproducible` both pass.
- [ ] Those images are scanned, SBOM-described, signed, and published by
      immutable digest. The release workflow implements all four, but it has
      never been run against a registry.
- [x] IaC defines exact app/API/preview DNS, managed TLS, private networking,
      managed TLS Redis, managed PostgreSQL, secrets, and container services,
      and validates cleanly. `terraform fmt`, `init -backend=false`, and
      `validate` all pass with `aws` 6.53.0.
- [ ] That topology is actually provisioned. Requires project-owned cloud
      credentials, domains, DNS, and secret values. Validation is not evidence
      of deployment.
- [x] CSP, security headers, cookie flags, exact-origin CORS, the cookie-free
      preview boundary, and the disabled publish endpoint pass black-box tests
      against the built applications.
- [x] The complete loopback-only production stack passes account, session,
      compile, preview, disabled-write, deletion, Redis-outage/recovery, and
      isolated PostgreSQL backup/restore drills through
      `pnpm test:local:milestone3`.
- [ ] The same headers pass against deployed production origins over real TLS.
- [ ] Configuration/release-state and PostgreSQL retention are backed up and
      restore-tested; Redis sessions/previews and browser drafts are excluded.
      The local isolated PostgreSQL restore drill passes and proves the
      exclusions, but no versioned cloud configuration or managed PostgreSQL
      point-in-time restore has been exercised.
- [ ] Dashboards, synthetics, SLOs, and actionable alerts are provisioned and
      test notifications reach the approved operator channel.
- [ ] Canary promotion and automatic/operator rollback are exercised against a
      deployed environment using immutable release manifests.

## Public release artifacts

- [x] Source-license decision is explicitly reconciled.
      [ADR 0008](decisions/0008-mit-source-release-supersedes-gpl-request.md)
      supersedes ADR 0004: MIT is authoritative, and the milestone's source
      release is delivered as complete corresponding source under MIT.
- [x] OCI reproducibility checks pass from a clean build for all three images.
- [x] Committed OpenAPI 3.1 artifact is complete and drift-checked by
      `pnpm openapi:check` and the repository unit gate.
- [x] [Deployment/operator guide](deployment.md), [runbook](runbook.md), and
      [release process](release-process.md) are published and internally
      consistent with the validated IaC and workflows.
- [ ] That guide has been executed end-to-end by an independent operator.
- [x] [Contributor guide](../CONTRIBUTING.md) and
      [security policy](../SECURITY.md) are published.
- [ ] A monitored private security contact is published. This remains a
      public-beta prerequisite.
- [ ] Incident, deployment, dependency, certificate, backup, and rollback
      runbooks are exercised against a deployed environment.
- [x] [Architecture](architecture.md) and [threat model](threat-model.md)
      describe the deployed topology and residual risks.
- [x] [Supported-feature matrix](supported-feature-matrix.md) distinguishes
      working, fixture-only, gated, unsupported, and external-evidence states.
- [ ] The corresponding-source release is published with release notes,
      notices, SBOMs, digests, and provenance. The license question is settled;
      the publication itself has not happened.

## Final audit record

The 2026-07-31 audit — exact commands, versions, results, retained reports, the
defects found and fixed, and every unmet external gate — is recorded in
[the audit record](evidence/milestone-3-audit-2026-07-31.md).

The locally runnable Milestone 3 product and repository engineering are
complete. Public beta remains gated on the unchecked items above, all of which
need external resources, an approved contact/channel, or a human tester rather
than further implementation in this checkout.
