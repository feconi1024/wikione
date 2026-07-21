# OCI release contract

`docker-bake.hcl` builds the `api`, `preview`, and `web` images from the pinned
inputs in the repository root. Images are published under immutable commit-SHA
tags and recorded by immutable digest in the release manifest. A human-friendly
version tag is a convenience reference only; deployment must consume the digest.

The release workflow produces artifacts only. The protected deployment workflow
accepts an explicit rollout action after verifying the signed manifest and all
three signed image digests:

- `plan` renders a reviewed Terraform plan without changing cloud state.
- `canary` deploys and smoke-tests the candidate in the protected staging
  environment before production promotion.
- `promote` applies the same verified manifest to the protected production
  environment.
- `rollback` selects a previously signed manifest by source revision from the
  versioned configuration bucket and restores all three image digests together.

The deployment workflow assumes a short-lived environment-scoped AWS role with
GitHub OIDC. Terraform owns the target infrastructure; the workflow persists the
Cosign-signed manifest, Sigstore bundle, deployment record, and last-known-good
pointer only after public smoke probes pass. Configuration backups must exclude
user drafts, sessions, preview documents, and MediaWiki credentials.
