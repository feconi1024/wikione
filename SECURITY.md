# Security policy

## Scope and current boundary

WikiOne handles first-party account credentials and transient wikitext, while
displaying target-generated content in an isolated preview origin. The security
model and residual risks are documented in [docs/threat-model.md](docs/threat-model.md).

First-party WikiOne registration, sign-in, session refresh, account controls,
and deletion are implemented. Wikimedia OAuth and all upstream wiki writes are
not implemented operationally: their endpoints intentionally return an
approval-pending response. A report about those placeholders is welcome, but
they must not be interpreted as a route to submit an edit.

## Supported versions

Security fixes are made for the latest `main` branch and the most recent signed
release once releases exist. There is no public-beta release tag at the time of
this policy; deployment/IaC files and local tests are not evidence of a live
public service.

## Reporting a vulnerability

Do **not** open a public issue for a suspected vulnerability, credentials,
private source, or exploit reproduction.

**Private reporting channel: PLACEHOLDER — project owner must publish a monitored
security email or disclosure form before public beta.** Until that channel is
published, contact the repository owner through GitHub’s private security
advisory feature, if enabled, and include only the minimum information needed
to establish contact. Do not send passwords, cookies, session tokens, target
wiki tokens, or real user wikitext.

Provide: affected revision/release digest, component, impact, safe reproduction
steps, expected versus observed behavior, and a suggested fix if available.
The maintainer should acknowledge within three business days, establish a
private tracking record, provide periodic status, credit reporters on request,
and coordinate a fix/release before public disclosure. These are target policy
goals, not a promise until the owner staffs the channel.

## Report priorities

Report promptly if you can bypass preview origin isolation; read/modify another
user’s account or session; weaken CSRF/origin/cookie controls; cause the BFF to
reach an arbitrary network target; expose source, credentials, or raw parser
HTML through logs/cache/errors; bypass input/rate limits; or make a placeholder
OAuth/publish route issue an upstream request.

Out of scope: vulnerabilities only in an upstream wiki or browser, denial of
service requiring unsustainably high traffic, social engineering, and reports
that require sending confidential production data. Dependency vulnerabilities
with a credible reachable path are in scope.

## Handling procedure

1. Triage against the documented trust boundaries and reproduce using synthetic
   data in an isolated environment.
2. Contain: revoke affected first-party sessions, rotate configured keys, block
   a malicious route/origin, or roll back to the last known-good immutable
   release as appropriate. Never log recovered secrets or source.
3. Fix with regression tests, review the threat model and API contract, scan
   dependencies/images, and prepare an SBOM/provenance-aware release manifest.
4. Deploy via the canary/rollback procedure, verify the fix, then notify the
   reporter and publish a minimal advisory when safe.

See [docs/runbook.md](docs/runbook.md) for operational containment, recovery,
certificate, backup, and rollback procedures. A future real OAuth/edit adapter
requires a separate security, privacy, and Wikimedia approval review; it is not
enabled by this policy or by a vulnerability fix.
