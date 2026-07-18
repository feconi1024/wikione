# Threat model

## Milestone 1 security objectives

1. Target-generated HTML and JavaScript cannot read or modify the editor origin.
2. Parser content never enters the editor DOM or API JSON response.
3. User-controlled wiki identifiers cannot turn backend requests into SSRF.
4. Draft source and parser output do not enter application logs or durable
   source storage.
5. Preview URLs are hard to guess, short-lived, and useless after expiry.
6. No partially implemented OAuth, session, or wiki-write surface exists before
   registration.

## Trust boundaries

- The Vue editor is trusted application code. Page titles, parser warnings, and
  safe API messages are rendered as text.
- The BFF receives draft source transiently, may call only fixed wiki registry
  URLs, and creates anonymous parser requests. It holds no credentials.
- Wikipedia APIs and ResourceLoader are external. Parser HTML, templates,
  gadgets, and scripts are active and potentially hostile even when served by
  Wikimedia.
- The preview application/origin is disposable and untrusted by the editor. It
  reads only opaque render bundles and cannot load source, authenticate, or
  publish.
- Redis contains rendered draft output for a short TTL and is not a source or
  session database.

## Implemented controls

### Parser HTML and ResourceLoader isolation

- Parser HTML is assembled into a complete document, never passed to editor
  `innerHTML`, and served from the separate preview origin.
- The iframe sandbox allows scripts and same-origin access only within that
  isolated origin; it does not grant forms, top navigation, downloads, camera,
  microphone, geolocation, or privileged parent messages.
- Preview responses set `no-store`, CSP, exact `frame-ancestors`, permissions,
  no-referrer, cross-origin resource policy, and `nosniff` headers.
- ResourceLoader's required inline/eval CSP allowances exist only on the
  preview origin. The editor CSP does not grant them.

### Head and module handling

- `headhtml` is parsed structurally. Only language, direction, and validated
  body-class tokens are read; raw head scripts/links/redirects are not copied.
- Known article style modules plus parser-declared `modulestyles` are loaded.
- Personalized `user`, `user.options`, and `user.styles` modules are filtered.

### SSRF, redirect, and request limits

- The browser submits `en-wikipedia`, not a URL. The server resolves it from a
  fixed registry containing clean HTTPS base/API URLs.
- The MediaWiki client rejects credentials, queries, fragments, non-HTTPS URLs,
  and redirects, and applies a 15-second timeout and `maxlag=5`.
- API bodies are capped at 600,000 bytes; preview source is capped at 500,000
  characters and page-source responses at 2,000,000.
- Preview creation is rate-limited to 30 requests/minute per instance/IP and
  the browser coalesces changes with a trailing debounce.

### Source and preview disclosure

- Request logging is disabled for BFF/preview services; safe error messages do
  not include upstream bodies or user input.
- Redis bundles contain rendered HTML but not raw wikitext, use random 192-bit
  IDs, expire after two minutes, and are served only by opaque GET route.
- Malformed, missing, and expired preview IDs receive the same safe 404 shape.
- The editor rejects stale compilation results and retains the last successful
  document when a later request fails.
- Browser drafts are source-only and can be explicitly discarded.

### Authentication and writes

- Sign-in is disabled, `/v1/auth/availability` always reports registration
  pending, and neither service exposes login, callback, token, session, logout,
  publish, or edit endpoints.
- No OAuth environment variables, cookies, Authorization handling, CSRF state,
  or write grants exist in the runtime. Future auth cannot be inferred from
  reserved TypeScript contracts.

## Remaining production work

- Use distinct HTTPS hostnames and exact production CORS/frame values; never
  collapse editor and preview onto one origin.
- Add a read-only, allowlisted resource proxy if deployment policy requires
  hiding user network metadata or constraining third-party resources.
- Add a shared adaptive upstream concurrency queue and 429/503/maxlag backoff
  for multi-instance public traffic; the current rate limiter is per instance.
- Pin production images, isolate Redis on a private network, apply resource
  limits, scan images, and configure metadata-only infrastructure log retention.
- Perform CSP/browser tests against the final deployment host and target
  ResourceLoader behavior.
- Before OAuth or publishing, conduct a new threat review covering encrypted
  tokens, host-only cookies, callback state, Origin/CSRF checks, revision-bound
  writes, diffs, summaries, conflicts, and revocation.
