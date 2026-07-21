# Reproducible builds and supply-chain evidence

WikiOne provides deterministic application/OpenAPI builds and a normalized OCI
runtime comparison. A release is reproducible only when the commands below pass
from an unmodified checkout at its exact source revision and their output is
retained with the signed release evidence.

## Clean checkout

Record the source SHA, OS/architecture, Node, pnpm, Docker/Buildx, and Terraform
versions. Then run:

```sh
git clone https://github.com/feconi1024/wikione.git wikione-verify
cd wikione-verify
git checkout <full-release-sha>
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm openapi:check
docker compose config --quiet
docker buildx bake --check
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
```

Run the accessibility, browser, visual, security, compatibility, and bounded
load gates as release tests. `pnpm test:live` is deliberately excluded from
deterministic reproduction because it reads changing external wiki state; keep
its dated report separately.

## Application and OCI comparison

Run:

```sh
pnpm build:reproducible
```

The script performs two clean application builds and compares hashes of every
declared output. It then builds `api`, `preview`, and `web` twice for the local
Linux platform with fixed source/version inputs, no cache, and provenance
disabled for the runtime comparison. It compares the runtime manifest/config
digests. Release publication still emits and signs provenance separately; an
attestation timestamp must not be mistaken for runtime nondeterminism.

Any mismatch is release-blocking. Retain the command output, builder versions,
source revision, Dockerfile/base-image digests, and compared runtime digests.

## Release evidence

For each image retain:

- the public fully qualified `ghcr.io/...@sha256:...` reference and platforms;
- source revision, locked Dockerfile/base-image digests, and Buildx command;
- BuildKit SBOM/provenance attestations and the separate SPDX SBOM artifact;
- image/source vulnerability and license scan results or an approved risk
  disposition;
- Cosign verification identity and signature evidence; and
- the independent reproducibility comparison output.

Mutable tags are discovery aids only. Terraform and deployment records consume
the immutable references in the signed release manifest.

## OpenAPI, manifest, and deployment record

`openapi/wikione.openapi.json` is generated from the API and protected by the
`pnpm openapi:check` drift test. Do not hand-edit it.

The signed release manifest contains only `version`, `revision`, `publishedAt`,
and the three image references; its canonical schema is
`infra/container/release-manifest.schema.json`. The protected deploy workflow
creates a separate record containing environment, action, deployment/release
workflow IDs, revision, UTC time, and Terraform plan SHA-256. It stores that
record, the exact plan, manifest, and Sigstore bundle in versioned KMS-encrypted
configuration storage.

Neither artifact may include raw wikitext, parser output, credentials, cookies,
session/preview data, user identity, or secret values.

## Licensing boundary

The current source, packages, and OCI labels are MIT. Milestone 3's GPL request
conflicts with standing repository governance and requires an explicit owner
and copyright-holder decision; it is not a build option. Do not relabel a
release or copy/adapt Wikimedia's GPL CodeMirror extension while MIT remains
authoritative.
