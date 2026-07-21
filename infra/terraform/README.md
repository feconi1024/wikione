# WikiOne AWS public-beta infrastructure

This directory defines one production-oriented AWS environment: three exact
public names (`app.<zone>`, `api.<zone>`, and `preview.<zone>`), an internet
facing ALB, and three private ECS Fargate services. The preview hostname stays
on its own origin so untrusted rendered markup cannot share the editor's
origin.

## Architecture and data boundaries

- Route53 validates an ACM certificate, and the ALB redirects HTTP to modern
  TLS before host-routing app, API, and preview traffic.
- Tasks run in private subnets without public IPs and use service-specific
  security groups. Only the ALB can reach each service port; only API can reach
  PostgreSQL, and only API/preview can reach Redis.
- RDS PostgreSQL is encrypted, Multi-AZ, deletion protected, and keeps
  automated backups for 7–35 days. Its master credential is RDS-managed.
- ElastiCache Redis is TLS-encrypted and IAM-authenticated with separate
  key-scoped API and preview users. It holds only encrypted sessions and
  short-lived isolated-preview bundles: snapshots and persistence are disabled,
  and browser drafts are never sent there or backed up.
- The versioned, encrypted configuration bucket may hold release manifests,
  approved Terraform plans, and configuration backups. It must not receive
  database exports, preview bundles, or browser drafts.
- ECS task definitions accept only `@sha256:` OCI references, preserve the
  images' non-root users, use restricted task roles, `/livez` container probes, and
  `/readyz` ALB deployment probes. ECS circuit breakers roll failed deployments
  back automatically.
- ECS consumes the public, signed GHCR digest references from the release
  manifest directly. The workflow must prove anonymous pull access before an
  apply; no second registry or mutable deployment tag is used.

## Secret and Redis setup

Create the two session-key Secrets Manager values outside Terraform through the
approved rotation process, then place **only their ARNs** in a non-committed
`*.tfvars` file or the protected `API_SECRET_ARNS_JSON` environment secret.
Terraform never invokes `GetSecretValue`, so those values do not enter its state
or plan. RDS manages its master password; ECS injects only the `password` JSON
key, while Terraform supplies the non-secret endpoint components. No operator
constructs or stores a `DATABASE_URL`.

Redis uses ElastiCache IAM auth so Terraform never handles an auth token. The
task injects only the TLS endpoint, cache/user identifiers, and region; WikiOne's
node-redis streaming provider signs a 15-minute token with the task role,
reauthenticates every ten minutes, and retries transient signing failures before
the current token expires. Do not replace this with an inline `auth_token`
variable: that would put a long-lived credential in Terraform state.

## Bootstrap and apply

Remote state cannot bootstrap itself. An administrator first creates a separate
encrypted, versioned state bucket (with public access blocked), grants the
deployment role scoped access, copies `backend.hcl.example` to a private
`backend.hcl`, and runs `terraform init -backend-config=backend.hcl`. State is
locked with S3 lockfiles; keep the state bucket separate from the configuration
backup bucket managed by this stack. The deployment role also needs scoped KMS
use for the operational key and read/write access to that configuration bucket.

1. Copy one of `examples/*.tfvars.example` to a private `*.tfvars` file and
   replace all example account IDs, domains, image digests, and secret ARNs.
2. Run `terraform fmt -recursive`, `terraform init -backend=false`, and
   `terraform validate` before review. In a real environment, use the backend
   configuration above and require a reviewed plan.
3. Publish scanned, signed images as public GHCR packages. The release workflow
   supplies their immutable digest references in the reviewed plan.
4. Configure protected `staging` and `production` GitHub environments with the
   variables and ARN-only secret documented in the deployment guide. Run
   `plan`, deploy and smoke-test the staging `canary`, then `promote` the same
   signed manifest after production approval.
5. Confirm ACM validation and the SNS email subscription, then verify each
   public endpoint and the `/readyz` synthetic canary. The workflow records the
   plan, deployment, signed manifest, and last-known-good pointer in the
   configuration bucket only after its public probes pass.

## Rollback and operations

ECS rolls deployments back when `/readyz` fails. The workflow also restores all
three images from the previously verified manifest when an apply or public probe
fails. Operator rollback selects a stored signed manifest by full revision;
never mix independently chosen service digests. Do not roll back databases
through container images. The CloudWatch dashboard combines ALB, ECS, RDS,
ElastiCache, synthetic readiness, and safe structured request-completion
metrics; SNS alerts require email confirmation and an exercised notification.

This is infrastructure code, not a deployment claim. Applying it requires an
AWS account, a delegated Route53 zone, deployment-role permissions, real image
digests, and secret ARNs supplied by the operator.
