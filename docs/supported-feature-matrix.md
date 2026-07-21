# Supported feature matrix

Status is deliberately specific: **supported** means implemented and covered by
the stated MVP boundary; **fixture-only** means exercised for compatibility but
not offered as a target; **gated** means the UI/route exists but operational
capability is intentionally disabled; **unsupported** means no product promise.

## Target and workflow support

| Capability                                                    | English Wikipedia MVP            | Chinese/Arabic Wikipedia            | Moegirlpedia                  | Notes                                                               |
| ------------------------------------------------------------- | -------------------------------- | ----------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Load page source/revision                                     | Supported anonymous read         | Fixture-only                        | Unsupported/post-MVP          | Fixed target registry; no arbitrary wiki URL                        |
| Compile target wikitext                                       | Supported anonymous read         | Fixture-only live/contract coverage | Unsupported/post-MVP          | Rendered on isolated preview origin                                 |
| Images, tables, math, references, audio/video, styles/modules | Supported within target response | Fixture-only                        | Unsupported/post-MVP          | Fidelity depends on current target parser/resources                 |
| RTL/Chinese/emoji source editing                              | Supported editor compatibility   | Fixture-only target rendering       | Unsupported target            | Browser coverage includes IME-safe input/RTL fixture                |
| Local draft/base snapshot                                     | Supported                        | Supported as client data            | Supported as client data      | Browser-only; never synced or backed up                             |
| First-party WikiOne account                                   | Supported                        | Supported as WikiOne identity       | Supported as WikiOne identity | Not a target-wiki identity                                          |
| Revision preflight, review, diff, three-way resolution        | Supported read-only preparation  | Fixture-only target responses       | Unsupported target            | Does not submit an edit                                             |
| Wikimedia OAuth connection                                    | Gated                            | Gated                               | Unsupported                   | Public consumer approval pending; endpoints are inert               |
| Upstream wiki write/publish                                   | Gated                            | Gated                               | Unsupported                   | `/v1/publish` returns approval-pending; no authenticated adapter    |
| Moegirl-specific templates/extensions/auth                    | Unsupported/post-MVP             | N/A                                 | Unsupported/post-MVP          | Requires target research, policy review, fixtures, and adapter work |

## Product behavior and limits

| Area                        | Status                    | Limit/boundary                                                                                          |
| --------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Source/compiled page layout | Supported                 | Side by side on wide screens; accessible source/preview tabs on narrow screens                          |
| Instant compile             | Supported                 | Debounced, abortable, latest-result-only; preview may retain last good document on error                |
| Preview isolation           | Supported                 | Separate cookie-free origin, opaque expiring ID, no parser HTML returned to editor                      |
| Preview retention           | Supported                 | Redis bundle default 120 seconds; maximum ten minutes; no backup                                        |
| Content fidelity            | Supported best effort     | Target wiki controls parser output, ResourceLoader modules, media availability, and accessibility       |
| Draft retention             | Supported                 | Local IndexedDB until discard/browser deletion; no operator recovery                                    |
| Account persistence         | Supported                 | PostgreSQL only; no email/password reset flow in initial implementation                                 |
| Session security            | Supported                 | Encrypted Redis sessions; 30-minute idle, 8-hour absolute expiry; production keys required              |
| Accessibility               | Release-gated             | WCAG 2.2 AA target for first-party UI; target-generated content cannot be repaired by WikiOne           |
| Browser support             | Release-gated policy      | See [browser-support.md](browser-support.md) for named tested engines/versions                          |
| Public deployment           | Pending external evidence | Requires owner domains, AWS credentials, secrets, alert channel, TLS, staging/canary/rollback exercises |

## Release and operations support

| Capability                    | Repository status                          | Evidence still required externally                                      |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Non-root/read-only OCI images | Implemented and locally smoke-tested       | published signed public digests and release-workflow run                |
| Application/OCI reproduction  | Implemented gate                           | clean independent release-candidate run and retained output             |
| OpenAPI 3.1 generation/drift  | Implemented gate                           | publish artifact/digest with release                                    |
| AWS Terraform topology        | Validated and IaC-scanned                  | reviewed account plan and successful apply                              |
| Managed TLS PostgreSQL/Redis  | Migration-gated least-privilege/IAM wiring | live private endpoints, failover/readiness, and RDS restore exercise    |
| Exact DNS/TLS/CSP/CORS        | Declared and locally tested                | live domain/certificate and public black-box probes                     |
| Dashboards/synthetics/alerts  | Declared                                   | provisioned dashboard, healthy synthetic, confirmed operator receipt    |
| Staging canary/promotion      | Automated                                  | protected-environment run and observation record                        |
| Automatic/operator rollback   | Automated                                  | failed-candidate and stored-revision exercises against deployed staging |
| Configuration-only backup     | Declared KMS/versioned policy              | object-version recovery evidence                                        |
| Source license                | MIT is currently authoritative             | owner reconciliation with Milestone 3's contradictory GPL request       |

The distinction between WikiOne and Wikimedia identity is non-negotiable. A
working WikiOne account must never imply a connected Wikimedia account or
permission to publish. Revisit this matrix only after public OAuth approval,
a dedicated security/privacy review, target-policy review, and real adapter
tests are complete.
