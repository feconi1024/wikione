# Operations runbook

This runbook is for the owner-approved public-beta environment described in
[deployment.md](deployment.md). It does not establish a deployed service by
itself. Never paste source, titles, passwords, cookies, tokens, parser HTML, or
secret values into tickets, dashboards, or chat. Use request IDs and normalized
error codes only.

## First response

1. Acknowledge the alert and record UTC time, environment, release manifest
   digest, affected origin/component, metric, and operator.
2. Check public `/healthz` and private workload/database/cache health without
   generating target-wiki load. Verify current deployment and last known-good
   manifest.
3. Classify severity: account/session exposure, preview isolation/CSP failure,
   sustained availability/5xx, latency/error-budget burn, data-store failure,
   certificate/DNS failure, backup failure, target API throttling, or release
   regression.
4. Contain first, preserve metadata-only evidence, and page the owner/on-call
   contact. Follow [SECURITY.md](../SECURITY.md) for suspected compromise.

## Common incident procedures

| Incident                         | Immediate containment                                                                                                | Recovery evidence                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| API/preview/web not ready        | stop promotion; inspect task/load-balancer health and dependency metrics; roll back if a new digest correlates       | all three origins healthy after stable observation window                   |
| 5xx/latency burn                 | reduce canary/traffic if possible; compare release and DB/Redis metrics; roll back rather than hot-patching          | SLO/latency return to threshold and alert clears                            |
| Redis failure                    | do not restore Redis; replace/recover managed service and expect sessions/previews to expire                         | new sessions/previews work; no stale session recovery                       |
| PostgreSQL failure               | stop writes/account actions if integrity is uncertain; fail over or restore only into isolated recovery target first | schema/readiness checks, approved restore report, deletion/retention review |
| authentication pressure          | preserve metadata, tighten rate/concurrency controls, scale only within tested limits, never log credentials         | password benchmark and controlled auth health recover                       |
| preview isolation/header failure | remove offending release from traffic immediately; verify separate origins/CSP/cookie boundary                       | black-box header/isolation tests pass on canary                             |
| target API 429/503/maxlag        | reduce or pause upstream work; honor Retry-After; do not retry storm or redistribute traffic                         | sequential read-only checks recover; target policy review recorded          |
| certificate/DNS issue            | halt promotion; validate certificate, Route 53 record, HTTPS redirect, and expiry alarm                              | independent HTTPS probe succeeds for all three origins                      |
| backup failure                   | investigate job/permissions/encryption; do not claim recoverability                                                  | successful backup plus isolated restore exercise                            |

## Dependency, image, and certificate response

For a dependency/base-image vulnerability, identify the exact lockfile or OCI
digest and determine whether the vulnerable path is reachable; do not suppress a
scanner finding merely because no exploit is public. Block an unreleased
candidate, or contain/roll back a deployed release when exposure warrants it.
Update the locked dependency/base digest, run the complete security,
reproducibility, SBOM, provenance, and signature pipeline, then canary the fix.
Retain the advisory, affected/replacement digests, scan disposition, approvers,
and deployment evidence without copying confidential exploit data.

For certificate or DNS failure, inspect ACM certificate/validation status,
Route 53 ownership/records, ALB listener attachment, and the `DaysToExpiry`
alarm. Do not bypass HTTPS, weaken the TLS policy, or co-locate preview with the
editor. Repair validation or issue a replacement managed certificate, apply a
reviewed Terraform plan, and verify independent TLS handshakes plus HTTP-to-HTTPS
behavior for all three exact names. Record the old/new certificate ARN and probe
results.

## Security incident and key rotation

For suspected credential/session compromise, remove affected release capacity if
needed, revoke first-party sessions, rotate the session encryption and lookup
HMAC secrets in the secret manager, deploy a new `SESSION_KEY_ID`, and verify
old session families cannot authenticate. Rotate the RDS-managed password using
the managed service procedure. Redis has no stored password; for a task-role or
cache-user compromise, revoke `elasticache:Connect`, replace the affected IAM
user/role policy, expire Redis sessions/previews, and redeploy. Do not add OAuth
secrets or attempt upstream revocation: no OAuth credentials are part of the
current supported runtime.

Record scope and affected data categories as described in `docs/privacy.md`.
Escalate through the private channel described in `SECURITY.md`; its owner
contact is still a required public-beta prerequisite.

## Canary, promotion, and rollback exercise

Before every release, verify the manifest signature, source revision, all three
image signatures/digests, SBOM/provenance evidence, vulnerability disposition,
IaC version, and approved change record. Use `.github/workflows/deploy.yml` with
`action=canary` in the protected staging environment. Its metadata-only probes
check readiness, HTTPS, exact CORS/CSP, preview cookie isolation, and OpenAPI;
they do not create an account or make a wiki edit.

Promote only after the observation window has no alert, error-budget, or
security regression. Production promotion is rejected unless its signed
manifest exactly matches staging's current successful canary. ECS circuit
breakers restore readiness failures; apply/probe failure also restores all three
images from the prior verified manifest. For an operator rollback, run the same
workflow with `action=rollback` and the stored full revision. Re-run smoke checks
and retain both manifests, timeline, metrics, and decision record. Record the
date, operator, initial/candidate/reverted digests, alert delivery, and result.

To exercise alert delivery in staging, choose a reversible alarm and run:

```sh
aws cloudwatch set-alarm-state --alarm-name <staging-alarm> \
  --state-value ALARM --state-reason "WikiOne staging notification drill"
```

Confirm receipt in the approved operator channel and return the alarm to
`INSUFFICIENT_DATA`. Never exercise production by generating authentication or
MediaWiki traffic.

## Restore drill

At the approved cadence, list configuration-object versions, retrieve a prior
manifest and bundle by version ID, and verify its Sigstore identity. Restore an
RDS point-in-time backup to a new private isolated identifier; do not attach the
public services or development environment. Verify Terraform/configuration
integrity, schema compatibility, readiness, and account deletion behavior with
synthetic accounts. Destroy the isolated recovery environment under the data
handling policy. Never restore Redis, browser drafts, preview bundles, source,
or parser HTML. Record RPO/RTO observed, object/snapshot IDs, restoration
operator, deletion proof, and any gaps.

## Post-incident

Within two business days, create a source-free incident record: timeline,
impact, root cause, release manifest, metrics, containment, recovery evidence,
follow-up owner/date, and whether public disclosure is required. Update this
runbook, threat model, tests, and alert thresholds where the incident exposed a
gap. Do not enable Wikimedia OAuth or upstream writes as an emergency workaround.
