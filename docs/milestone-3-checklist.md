# Milestone 3 completion checklist

Date opened: 2026-07-19

This checklist is deliberately evidence-first. Leave an item unchecked until
the cited artifact or external state proves the complete requirement.

## Hardening suites

- [ ] Accessibility automation and manual checklist cover every route, modal,
      keyboard flow, responsive mode, and the isolated preview document.
- [ ] Security tests and CI scans cover application, dependencies, secrets,
      licenses, OCI images, headers, isolation boundaries, and disabled writes.
- [x] Load/resilience thresholds pass against an isolated release stack without
      sending load to Wikimedia. See the [HTTP](evidence/milestone-3-load-2026-07-19.json)
      and [password](evidence/milestone-3-password-load-2026-07-19.json) reports.
- [x] Chromium, Firefox, WebKit, mobile Chromium, and mobile WebKit pass the
      [supported browser suite](evidence/milestone-3-browser-2026-07-19.md).
- [x] Reviewed desktop/mobile visual baselines pass without unexplained drift,
      as recorded in the [browser evidence](evidence/milestone-3-browser-2026-07-19.md).
- [x] MediaWiki contract fixtures and the read-only live compatibility matrix
      pass for every supported target in the
      [compatibility report](evidence/milestone-3-compatibility-2026-07-19.json).

## Deployment and operations

- [ ] Minimal non-root OCI images are reproducible, scanned, SBOM-described,
      signed, and published by immutable digest.
- [ ] IaC provisions exact app/API/preview DNS, managed TLS, private networking,
      managed TLS Redis, managed PostgreSQL, secrets, and container services.
- [ ] Production CSP and headers pass black-box tests; preview remains
      cookie-free and cannot reach account or publishing capabilities.
- [ ] Configuration/release-state and PostgreSQL retention are backed up and
      restore-tested; Redis sessions/previews and browser drafts are excluded.
- [ ] Dashboards, synthetics, SLOs, and actionable alerts are provisioned and
      test notifications reach the approved operator channel.
- [ ] Canary promotion and automatic/operator rollback are exercised against a
      deployed environment using immutable release manifests.

## Public release artifacts

- [ ] Source-license decision is explicitly reconciled: Milestone 3 says GPL,
      while current repository governance and source metadata say MIT.
- [ ] Clean-checkout application and OCI reproducibility checks pass.
- [x] Committed OpenAPI 3.1 artifact is complete and drift-checked by
      `pnpm openapi:check` and the repository unit gate.
- [ ] Deployment/operator guide is executable by an independent operator.
- [x] [Contributor guide](../CONTRIBUTING.md) and
      [security policy](../SECURITY.md) are published. A monitored private
      contact remains a separate public-beta prerequisite.
- [ ] Incident, deployment, dependency, certificate, backup, and rollback
      runbooks are exercised.
- [ ] Architecture and threat model describe the deployed topology and residual
      risks.
- [x] [Supported-feature matrix](supported-feature-matrix.md) distinguishes
      working, fixture-only, gated, unsupported, and external-evidence states.
- [ ] GPL-compatible corresponding source or the explicitly approved
      replacement license release is published with release notes, notices,
      SBOMs, digests, and provenance.

## Final audit record

Record exact command versions, results, image digests, deployment identifier,
domain probes, alert/rollback exercises, source-release URL, and any external
approval gates here before marking Milestone 3 complete.
