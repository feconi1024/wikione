# Public-beta release process

This process turns a reviewed commit into signed artifacts and then a protected
AWS deployment. It does not authorize a public-beta announcement until the
external evidence and owner decisions are complete. WikiOne remains MIT under
current repository governance; Wikimedia OAuth and upstream writes remain
disabled in every release.

## 1. Freeze the candidate

Record the full commit, version, changelog entry, compatibility/browser/load
evidence, known limitations, release manager, approvers, deployment window, and
last-known-good revision. Confirm that the worktree contains no credentials,
source-bearing artifacts, local Terraform data, or unreviewed generated output.
Database changes must use an expand/contract sequence that remains compatible
with the last-known-good image; a container rollback never reverses PostgreSQL.

Run from a clean checkout:

```sh
pnpm install --frozen-lockfile
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
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

`test:live` is sequential and read-only; use the monitored User-Agent and retain
its dated source-free report. It is not publishing evidence.

## 2. Publish and verify artifacts

Run `.github/workflows/release.yml`. The workflow:

- scans source for secrets, vulnerable dependencies, and license findings;
- builds multi-platform `api`, `preview`, and `web` GHCR packages from pinned
  inputs; the owner must make those packages public before deployment;
- emits BuildKit SBOM/provenance attestations and separate SPDX SBOM artifacts;
- scans every image for high/critical vulnerabilities;
- keylessly signs each immutable digest; and
- creates and keylessly signs `release-manifest.json` plus its Sigstore bundle.

The signed manifest has one intentionally small schema:

```json
{
    "version": "<release>",
    "revision": "<full-source-sha>",
    "publishedAt": "<UTC-date-time>",
    "images": {
        "api": "ghcr.io/...@sha256:...",
        "preview": "ghcr.io/...@sha256:...",
        "web": "ghcr.io/...@sha256:..."
    }
}
```

SBOMs, provenance, scan output, and signatures are related immutable workflow
artifacts/attestations, not invented fields in this manifest. Record the release
workflow run ID and prove all GHCR references are anonymously pullable.

## 3. Plan and staging canary

Use the protected deployment workflow with `action=plan`; a second operator
reviews DNS, certificates, exact image references, IAM/network changes,
retention, alert recipient, and cost impact. Then run `action=canary` in the
protected `staging` GitHub environment.

The workflow independently verifies the manifest and three image signatures,
checks anonymous registry access, checks out the manifest's source revision,
applies the reviewed Terraform plan, and performs metadata-only public probes.
The probes must pass exact TLS, CSP, CORS, cookie isolation, readiness, and
OpenAPI checks without creating a user or contacting a wiki write endpoint.

Observe the dashboard/synthetic for the approved window. Exercise SNS delivery,
an ECS readiness rollback, operator rollback, and the configuration/RDS restore
drill. Preserve source-free evidence.

## 4. Production promotion

Run `action=promote` in the protected `production` environment using the same
release workflow run ID. The workflow retrieves staging's current signed
manifest and requires a byte-for-byte match before planning. Required reviewers
provide the production approval.

ECS circuit breakers handle task-level readiness failure. A failed apply or
public probe also restores all three references from the previously verified
last-known-good manifest. After successful probes, the workflow stores the
manifest, Sigstore bundle, plan and hash, deployment record, and current pointer
in the KMS-encrypted versioned configuration bucket.

## 5. Publication gate

Before announcement, the owner must:

- explicitly reconcile the Milestone 3 GPL request with the repository's MIT
  policy and record the authorized result;
- publish a monitored private security contact;
- complete the manual screen-reader/zoom/forced-colors accessibility sign-off;
- retain real domain/TLS/deployment/dashboard/alert/restore/rollback evidence;
  and
- publish source/tag, release notes, supported-feature matrix, OpenAPI,
  compatibility report, image digests, SBOMs, provenance, signatures, and known
  limitations.

Do not label an unexercised workflow as a deployment or a Terraform validation
as a live service. Do not use a release to bypass Wikimedia consumer approval.

## 6. Rollback and aftercare

Operator rollback supplies the stored full source revision to
`.github/workflows/deploy.yml`; the workflow verifies that complete signed
manifest and restores the three images together. Never select independent
service digests or roll back PostgreSQL through an image release.

Monitor readiness, 5xx, p95 latency, task count/exits, authentication pressure,
Redis/PostgreSQL health, certificate expiry, RDS events, and synthetic results.
Follow [the operations runbook](runbook.md) for containment and recovery.
