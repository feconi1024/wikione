# Deployment and operator guide

This guide operates the AWS public-beta topology declared in
`infra/terraform`. It does not claim that an AWS account, domain, certificate,
alert subscription, backup, or deployment currently exists. A public-beta claim
requires the external evidence listed at the end of this guide.

## Deployed shape

Use three exact HTTPS names in one existing public Route 53 zone:

| Role    | Example                       | Boundary                                             |
| ------- | ----------------------------- | ---------------------------------------------------- |
| Editor  | `https://app.example.org`     | first-party UI; no target-generated document         |
| API     | `https://api.example.org`     | exact editor-origin CORS and host-only secure cookie |
| Preview | `https://preview.example.org` | cookie-free target-rendered document                 |

Terraform creates an internet-facing ALB, exact-host HTTP redirects and HTTPS
routing, ACM DNS validation, private multi-AZ Fargate tasks, managed PostgreSQL,
TLS/IAM-authenticated Redis, KMS-encrypted configuration storage, CloudWatch
logs/metrics/synthetics, SNS alerts, and Route 53 records. Only the ALB has a
public ingress path. API alone can reach PostgreSQL; API and preview alone can
reach Redis. Task internet egress is TLS-only for AWS services, public GHCR, and
the fixed supported MediaWiki APIs.

The public GHCR packages must permit anonymous pulls because Fargate consumes
the signed `ghcr.io/...@sha256:...` references directly. The deployment workflow
proves anonymous access before planning.

## Bootstrap inputs

An administrator must create these resources before the application stack:

1. An encrypted, versioned S3 Terraform-state bucket with public access blocked
   and S3 lockfiles enabled. Keep it separate from the configuration bucket that
   the stack creates.
2. A GitHub OIDC deployment role whose trust policy is restricted to this
   repository and the applicable protected GitHub environment. Grant only the
   actions shown by a reviewed plan, including state access, stack management,
   referenced secret reads, and use of the stack's operational KMS key.
3. Two independently generated 32-byte base64 secrets in Secrets Manager:
   `SESSION_ENCRYPTION_KEY_BASE64` and `SESSION_LOOKUP_HMAC_KEY_BASE64`.
   Terraform receives their ARNs, never their values.
4. Public `staging` and `production` DNS names in an existing Route 53 zone and
   a monitored alert address.

RDS creates and rotates its master password. ECS injects only the `password`
JSON key and non-secret connection components; an operator must not construct a
`DATABASE_URL`. Redis has no stored password: task roles sign 15-minute IAM
credentials and the client reauthenticates every ten minutes.

## Protected GitHub environments

Configure both `staging` and `production` with required reviewers. Set these
environment variables:

| Variable                  | Example/meaning                                     |
| ------------------------- | --------------------------------------------------- |
| `AWS_ACCOUNT_ID`          | expected 12-digit deployment account                |
| `AWS_REGION`              | region containing the complete environment          |
| `AWS_DEPLOY_ROLE_ARN`     | OIDC role assumed by `.github/workflows/deploy.yml` |
| `ALERT_EMAIL`             | monitored SNS subscription and upstream contact     |
| `AVAILABILITY_ZONES_JSON` | JSON array containing at least two regional AZs     |
| `ROUTE53_ZONE_NAME`       | existing public zone without a trailing dot         |
| `TF_STATE_BUCKET`         | separately bootstrapped versioned state bucket      |
| `TF_STATE_KEY`            | environment-specific state object key               |
| `TF_STATE_REGION`         | state bucket region                                 |
| `TERRAFORM_TAGS_JSON`     | optional JSON object of organization tags           |
| `CANARY_CONFIG_BUCKET`    | production only: staging configuration-bucket name  |

Set `API_SECRET_ARNS_JSON` as an environment secret containing only an ARN map:

```json
{
    "SESSION_ENCRYPTION_KEY_BASE64": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:...",
    "SESSION_LOOKUP_HMAC_KEY_BASE64": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:..."
}
```

Do not configure Wikimedia OAuth credentials. First-party WikiOne accounts are
functional, but Wikimedia OAuth and upstream writes remain inert.

## Local validation and reviewed plan

From a clean checkout at the candidate revision:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm openapi:check
docker compose config --quiet
docker buildx bake --check
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

For an independent manual plan, copy an example to an ignored `*.tfvars` file,
replace every placeholder, and initialize with a private `backend.hcl` based on
`infra/terraform/backend.hcl.example`:

```sh
terraform -chdir=infra/terraform init -backend-config=backend.hcl
terraform -chdir=infra/terraform plan -out=deployment.tfplan \
  -var-file=production.tfvars
terraform -chdir=infra/terraform show deployment.tfplan
```

Never commit a tfvars file, backend configuration, state, plan, AWS credential,
secret value, session, preview bundle, source, or parser output.

## Signed release and deployment sequence

1. Run `.github/workflows/release.yml` for the reviewed revision. It builds,
   scans, attests, signs, and publishes all three public GHCR images, then signs
   `release-manifest.json` with Sigstore. Record its workflow run ID.
2. Run `.github/workflows/deploy.yml` with `action=plan` to review the exact
   immutable image references and infrastructure change.
3. Run the same workflow with `environment=staging`, `action=canary`, and that
   release run ID. The workflow verifies the manifest and images, applies the
   plan, and tests TLS health, OpenAPI, exact CSP/CORS, and the preview's
   cookie-free boundary.
4. Observe the staging dashboard and synthetic canary for the approved window.
   Exercise alert delivery and rollback before production.
5. Run `environment=production` and `action=promote` with the same release run
   ID. Promotion fails unless the signed manifest is byte-identical to staging's
   last successful canary manifest.

ECS circuit breakers automatically restore tasks that fail `/readyz`. If apply
or public smoke probes fail after a previous release exists, the workflow also
plans and restores all three image references from the verified last-known-good
manifest. It never rolls back a database through a container release.

Operator rollback selects a complete prior release, never independent service
digests:

```text
environment = staging or production
action = rollback
rollback_revision = <stored full 40-character source revision>
```

The workflow retrieves and verifies that revision's signed manifest from the
versioned configuration bucket before applying it.

## Runtime configuration

Terraform generates these values; operators should not override them in task
definitions:

| Value group                            | Source and invariant                                      |
| -------------------------------------- | --------------------------------------------------------- |
| `API_ORIGIN`, `PREVIEW_ORIGIN`         | exact HTTPS names; web entrypoint validates them          |
| `EDITOR_ORIGINS`, `PREVIEW_BASE_URL`   | exact editor/preview HTTPS origins                        |
| `DATABASE_HOST/PORT/NAME/USER`         | RDS resource attributes                                   |
| `DATABASE_PASSWORD`                    | RDS-managed secret's `password` JSON key                  |
| `REDIS_URL`                            | private `rediss://` endpoint without embedded credentials |
| `REDIS_IAM_CACHE_NAME/USER_ID`, region | separate key-scoped API/preview IAM identities            |
| session key values                     | Secrets Manager references supplied by ARN                |
| `COOKIE_SECURE`, `TRUST_PROXY_HOPS`    | `true` and exactly one ALB hop                            |
| `MEDIAWIKI_USER_AGENT`                 | product URL plus monitored alert address                  |

The web image is target-neutral. Its entrypoint validates the two exact origins
and writes `/tmp/wikione-runtime-config.js` under the read-only task filesystem;
no target-specific image rebuild is required.

## Configuration backup and restore drill

The stack's KMS-encrypted, versioned configuration bucket stores only signed
release manifests/bundles, reviewed Terraform plan binaries and hashes,
deployment records, and the current last-known-good pointer. Terraform state is
stored in the separately bootstrapped versioned state bucket. PostgreSQL uses
encrypted automated backups with 7–35 day retention and a final snapshot.

Never back up IndexedDB drafts/base source, Redis sessions, preview bundles,
parser HTML, raw wikitext, cookies, or future OAuth tokens. Redis is deliberately
ephemeral and must not be restored.

Before public beta, retrieve a prior configuration object version with
`aws s3api list-object-versions`/`get-object --version-id`, verify its Sigstore
bundle, and compare it with the deployment record. Restore an RDS point-in-time
backup to a new isolated identifier, attach no public route, verify schema and
readiness with synthetic accounts, record observed RPO/RTO, then delete it under
the retention policy. Never restore production identity data into development.

## Monitoring and alert exercise

The operations dashboard covers target health, p95 latency, target/application
5xx, ECS running task count, RDS/Redis CPU and connections, authentication
rejections, and synthetic readiness. Alarms cover those signals, certificate
expiry, unexpected task exits, RDS backup/failure/maintenance/recovery events,
and canary failure.

Confirm the SNS email subscription, then exercise a reversible alarm in staging
with `aws cloudwatch set-alarm-state`; record receipt time and reset it to
`INSUFFICIENT_DATA`. Also force a disposable staging candidate to fail readiness
and prove the ECS/workflow rollback path. Follow [the runbook](runbook.md).

## Evidence required before a deployment claim

Record the AWS deployment ID/account/region, exact three domains, certificate,
source revision, signed manifest and image digests, plan hash, config/state
bucket versioning and encryption, RDS restore drill, synthetic result, dashboard,
alert receipt, canary observation, automatic rollback, operator rollback, and
approvers. Without that evidence, the repository is deployable but not deployed.
