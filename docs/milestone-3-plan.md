# Milestone 3 plan: hardening and public beta

Date: 2026-07-19

Milestone 3 is the final engineering gate before the WikiOne MVP public beta.
It converts the Milestone 2 application into an auditable, deployable release.
The milestone is complete only when each requirement has executable evidence;
an implementation note or an unchecked manifest is not sufficient.

## Release boundaries

- English Wikipedia remains the only supported MVP target. Chinese and Arabic
  Wikipedia are compatibility fixtures; Moegirlpedia remains a post-MVP target.
- First-party WikiOne accounts are functional. Wikimedia OAuth and upstream
  writes remain disabled until public consumer approval and a separate adapter
  security review.
- Browser drafts and preview/session Redis values are intentionally excluded
  from backups. Durable PostgreSQL account data has its own managed retention
  and deletion policy.
- Production uses distinct editor, API, and cookie-free preview origins. Only
  the preview origin may display target-generated documents.
- The milestone requests a “GPL source repository,” while the standing
  repository policy requires MIT and the current source is MIT-licensed. The
  owner resolved this in favour of MIT;
  [ADR 0008](decisions/0008-mit-source-release-supersedes-gpl-request.md)
  records the decision and delivers the artifact as complete corresponding
  source published under MIT. No relicensing occurs.

## Workstream A: release-hardening suites

### Accessibility

- Run axe against every first-party route and modal state on desktop and
  mobile, with no serious or critical findings.
- Exercise keyboard-only navigation, focus entry/return, dialog dismissal,
  menus, editor toolbar, pane splitter, mobile source/preview tabs, error
  states, and reduced-motion behavior.
- Audit the compiled preview as a top-level document so the cross-origin iframe
  is not silently excluded from accessibility evidence.
- Record the manual screen-reader and zoom checklist that automation cannot
  prove.

### Security

- Add black-box tests for exact-origin CORS, CSRF, cookie flags, cache policy,
  CSP, isolated preview headers, hostile preview content, body limits, safe
  errors, and disabled OAuth/publishing boundaries.
- Add secret, dependency, source-license, OCI-vulnerability, SBOM, and container
  configuration checks to CI.
- Add dependency-aware readiness endpoints, production proxy configuration,
  least-privilege containers, immutable image references, resource limits, and
  environment validation.

### Load and resilience

- Provide a bounded load harness for health/readiness, authentication
  availability, preview misses, and opt-in password verification pressure.
- Define latency, error-rate, and availability thresholds; never load-test a
  public Wikimedia API.
- Run the gate against an isolated stack and retain a machine-readable report.

### Browser compatibility

- Run Playwright on Chromium, Firefox, WebKit, mobile Chromium, and mobile
  WebKit.
- Cover IndexedDB recovery, CodeMirror editing/IME-safe input, cookies, fetch
  cancellation, iframe isolation, focus, and responsive layout.
- Publish the supported browser policy and minimum versions.

### Visual regression

- Commit deterministic desktop and mobile baselines for the editor, account,
  connected-app/privacy routes, authentication and publish dialogs, conflicts,
  and error states.
- Freeze generated data, mock all network traffic, disable animation, and use
  reviewed pixel-diff tolerances. Live Wikimedia pages are not visual baselines.

### Target API compatibility

- Add contract fixtures for revision and parse response variants, missing and
  non-wikitext pages, redirects, warnings/modules/styles, malformed responses,
  429/5xx/maxlag, Retry-After, timeouts, and RTL/media output.
- Retain identified, sequential live fixtures as an intentional read-only gate
  and produce a dated compatibility report.

## Workstream B: OCI release and infrastructure as code

- Build minimal, non-root `web`, `api`, and `preview` OCI images from locked
  inputs. Publish immutable digests with SPDX SBOMs, vulnerability results,
  provenance, and signatures.
- Provision a production topology with infrastructure as code: private network,
  managed PostgreSQL and TLS Redis, container runtime, registry, exact DNS,
  managed certificates, HTTPS redirects, secrets, logs, and least-privilege
  workload identities.
- Serve editor, API, and preview on separate names. Generate the editor CSP from
  exact API and preview origins; retain the preview document CSP and cookie-free
  boundary.
- Back up versioned configuration, release manifests, Terraform state, and the
  explicitly retained PostgreSQL account store. Never back up browser drafts,
  preview bundles, or Redis sessions.
- Provision dashboards and actionable alerts for readiness, 5xx/error-budget
  burn, latency, Redis/PostgreSQL failures, auth pressure, preview failures,
  container restarts, certificates, and backup status.
- Deploy by digest, canary and smoke-test before promotion, persist the last
  known-good manifest, and provide automatic and operator-triggered rollback.
- Production creation requires project-owned cloud credentials, domains, DNS,
  secret values, and an approved environment. IaC validation is necessary but
  is not evidence that those external resources were actually deployed.

## Workstream C: public release artifacts

- Generate and commit the complete OpenAPI 3.1 document. CI must fail on drift.
- Document clean-checkout and OCI reproducibility and compare artifact digests.
- Deliver the deployment/operator guide, contributor guide, security policy,
  incident runbook, architecture, threat model, privacy/retention policy, API
  policy, and supported-feature matrix.
- Publish source, release notes, dependency/source notices, image digests,
  SBOMs, attestations, compatibility report, and signed release manifest.
- Resolve the MIT/GPL governance conflict before the final public source
  release; record the outcome in a superseding ADR and all package metadata.
  Done: [ADR 0008](decisions/0008-mit-source-release-supersedes-gpl-request.md)
  supersedes ADR 0004, and every manifest already declares MIT.

## Acceptance evidence

The release checklist must map every item above to repository paths and command
or external-state evidence. At minimum the final audit runs:

```sh
pnpm check
pnpm build
pnpm test:a11y
pnpm test:browser
pnpm test:visual
pnpm test:security
pnpm test:compat
pnpm test:load
pnpm test:live
pnpm openapi:check
pnpm build:reproducible
docker compose config --quiet
docker buildx bake --check
terraform fmt -check -recursive infra/terraform
terraform init -backend=false infra/terraform
terraform validate infra/terraform
```

CI security/image/IaC checks, a staging deployment, domain/TLS probes, dashboard
and alert tests, backup inspection, canary promotion, and an actual rollback are
separate required evidence. Public-beta completion cannot be inferred solely
from local tests.
