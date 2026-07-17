# Threat model

## Security objectives

1. Target-generated HTML and JavaScript cannot read or modify the editor origin.
2. OAuth tokens and wiki credentials never reach preview documents or browser
   JavaScript.
3. User-controlled wiki identifiers cannot turn backend requests into SSRF.
4. Draft source, parser output, edit summaries, and tokens do not enter logs or
   durable server storage.
5. Publishing is revision-bound, explicitly confirmed, and protected from CSRF.

## Trust boundaries

- The editor UI is trusted application code but displays untrusted page titles,
  parser warnings, and API errors as text.
- The BFF is trusted with OAuth tokens and is the only component allowed to make
  authenticated write calls.
- Wikipedia APIs and ResourceLoader are external services. Their parser HTML and
  JavaScript are treated as active, potentially hostile content even when
  operated by Wikimedia.
- The preview origin is intentionally disposable and untrusted by the editor.
- Wikitext is user-controlled and may expand templates maintained by unrelated
  wiki users.

## Threats and controls

### Parser HTML or ResourceLoader code escapes into the editor

- Never use `innerHTML` with parser output on the editor origin.
- Serve the complete document on a separate preview origin.
- Embed it using an iframe sandbox that permits only scripts and same-origin
  access within the isolated preview site.
- Do not grant top navigation, downloads, forms, camera, microphone, or
  geolocation.
- Parent message handlers must accept no privileged commands from preview code.

### Malicious `headhtml`

- Parse it structurally and read only `html[lang]`, `html[dir]`, and validated
  body class tokens.
- Reconstruct known head elements; never copy raw scripts, event handlers,
  redirects, preload links, or forms from `headhtml`.

### Personalized modules leak data or behavior

- Filter `user`, `user.options`, and `user.styles` even if `action=parse`
  declares them.
- The spike makes anonymous parse calls and sends no wiki cookies.
- Default site gadgets returned for anonymous published pages may run only in
  the isolated preview origin.

### Cross-site request forgery or token theft

- Future OAuth tokens remain encrypted in the BFF and are referenced by a
  random host-only `HttpOnly`, `Secure`, `SameSite=Lax` session cookie.
- OAuth uses exact callbacks and state. Publishing additionally checks Origin
  and an application CSRF header.
- Preview and asset proxy routes never receive Authorization headers or cookies.

### SSRF and unsafe redirects

- Production wiki hosts come from a signed/configured Wikimedia registry.
- URLs must be clean HTTPS endpoints without embedded credentials, query, or
  fragment.
- Reject redirects, private/reserved IP ranges, unexpected ports, and response
  bodies over configured limits.
- Preview asset proxies permit only explicit read-only ResourceLoader/API/REST
  routes and strip credentials and `Set-Cookie`.

### Source disclosure

- Do not log titles, source, parser output, summaries, or request bodies.
- Render bundles receive random IDs, `no-store`, and short TTLs.
- Generated spike output is ignored; developers must delete it before sharing a
  workspace archive.
- The UI must disclose that draft wikitext is sent to the selected wiki to
  compile it.

### Publishing races and unintended writes

- Send `baserevid`, base/start timestamps, and `createonly` or `nocreate`.
- Require a non-empty summary and show a diff before sending.
- On conflict, fetch latest source and require user confirmation after merge.
- Never run write tests against arbitrary public articles.

## Current limitations

ResourceLoader requires inline/eval-compatible execution. Those CSP allowances
exist only on the isolated preview origin and are unacceptable on the editor or
BFF origins. The Milestone 0 server is a demonstrator; production must add a
separate hostname, ephemeral render storage, host allowlists, response limits,
and a read-only resource proxy before public deployment.
