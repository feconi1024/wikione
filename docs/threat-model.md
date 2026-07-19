# Threat model

## Milestone 2 security objectives

1. Target-generated HTML/JavaScript cannot reach the editor, accounts, or
   cookies.
2. WikiOne account authentication cannot be confused with Wikimedia
   authorization.
3. Passwords, cookies, session payloads, source, and summaries do not enter logs
   or unsafe storage.
4. Session fixation, CSRF, refresh replay, idle/absolute expiry, and revocation
   have explicit controls.
5. Wiki selection cannot become SSRF and review input cannot become HTML
   injection or unbounded diff work.
6. Public OAuth and MediaWiki writes remain impossible before approval.

## Trust boundaries

- The Vue editor is trusted application code. Diff, conflict, identity, and
  errors are rendered as text.
- The BFF handles credentials and source transiently, talks only to fixed wiki
  and private database/cache endpoints, and disables request logging.
- PostgreSQL is durable identity storage; Redis is ephemeral encrypted session
  and preview storage. Neither should be public-network reachable.
- The preview origin is disposable/untrusted by the editor, receives no account
  cookie, and exposes no auth/publish routes.
- Wikipedia APIs, parser HTML, ResourceLoader, templates, and gadgets are
  external and potentially hostile.

## Implemented controls

### Passwords and accounts

- Usernames are NFKC/case normalized for uniqueness while retaining display
  form. PostgreSQL enforces the unique normalized key.
- Passwords require at least 12 characters and at most 128 UTF-8 bytes and may
  not contain the username.
- Production hashing uses Node scrypt with `N=2^17`, `r=8`, `p=1`, a random
  16-byte salt, 32-byte output, and constant-time comparison. Hash parameters
  are encoded for future upgrade.
- Login failures do not disclose whether username or password was wrong.
- Register/login/password/delete routes are bounded and rate-limited.

### Sessions, Origin, and CSRF

- Cookies contain random 256-bit tokens only, are HTTP-only, host-only,
  `SameSite=Lax`, and `Secure` by default outside explicit local configuration.
- Redis lookup keys and account/family indexes are HMAC-SHA-256 values.
- Session envelopes use AES-256-GCM with random IV, authenticated key ID, and a
  separately configured HMAC key.
- Unknown IDs are rejected. Refresh atomically converts active to retired and
  creates the new token; retired-token replay revokes its family.
- 30-minute idle and eight-hour absolute expiry are server enforced.
- Exact configured Origin is required for registration/login and all account
  mutations. Cookie-authenticated mutations also require the current
  synchronizer CSRF header; cross-site Fetch Metadata is rejected.
- Password change and deletion require current password; logout-all and account
  deletion revoke account sessions.

### Review, merge, and publishing boundary

- Review/merge accept at most 500,000 characters and use time/edit bounds for
  two-way diff. All output stays text-only.
- Base revision ID and timestamp must be paired. Revision preflight resolves a
  fixed wiki ID and anonymously reloads current wikitext.
- Three-way merge exposes every true overlap; it never silently chooses local or
  remote text. Applying manual/mine/latest resolution returns through the normal
  draft and preview pipeline.
- Provider failures are narrowed to a safe enum. Arbitrary upstream details are
  not returned.
- The installed production provider is disabled. OAuth start/callback and
  `/v1/publish` return 503; no runtime method issues a MediaWiki edit.
- Fake-provider tests cover create-only intent, revision-bound updates, exact
  revision verification, and AbuseFilter/CAPTCHA/error mapping.

### Parser and SSRF isolation

- Parser HTML is never inserted into the editor DOM and is served only from the
  sandboxed preview origin with CSP, frame, permissions, no-referrer,
  cross-origin, no-store, and `nosniff` controls.
- Browser input provides a fixed registry ID, not an upstream URL. The
  MediaWiki client rejects non-HTTPS/credential/query/fragment URLs and
  redirects and uses timeout/maxlag.
- Request/body/source limits, preview debounce, rate limits, opaque 192-bit
  preview IDs, and short TTL constrain load and disclosure.

## Remaining production risks and gates

- Use unique managed encryption/HMAC keys, documented rotation/recovery, private
  database/cache networks, TLS, backups, least privilege, dependency/image
  scanning, resource limits, and incident response.
- Replace per-instance authentication/upstream rate limits with shared adaptive
  Redis limits before horizontally scaled public traffic.
- Benchmark production scrypt concurrency and tune upward only within latency
  and memory budgets; protect the service from distributed password-hash load.
- Review public privacy/terms, account deletion and backup retention, operator
  access, and security contact before accepting real users.
- After public Wikimedia consumer approval, conduct a separate review of OAuth
  state/PKCE/callbacks, secret and token encryption/rotation, grant scope,
  revocation, authenticated edit CSRF tokens, abuse/CAPTCHA behavior, and live
  conflict/revision verification. Approval alone does not enable the adapter.
