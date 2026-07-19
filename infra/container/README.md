# OCI release contract

`docker-bake.hcl` builds the `api`, `preview`, and `web` images from the pinned
inputs in the repository root. Images are published under immutable commit-SHA
tags and recorded by immutable digest in the release manifest. A human-friendly
version tag is a convenience reference only; deployment must consume the digest.

The release workflow accepts an explicit rollout action:

- `none` produces and signs the immutable candidate only.
- `canary` produces a manifest for a named canary percentage; the deployment
  system applies that manifest only after its health checks pass.
- `promote` moves an already verified digest to the full public-beta service.
- `rollback` requires `rollback_digest` and creates a manifest pointing back to
  that known-good immutable digest.

The workflow does not contain long-lived cloud credentials or deploy directly.
Terraform owns the target infrastructure and deployment automation consumes the
Cosign-signed manifest and its Sigstore bundle. Configuration backups must
exclude user drafts, sessions, preview documents, and MediaWiki credentials.
