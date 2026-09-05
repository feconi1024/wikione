# ADR 0003: Separate, untrusted preview origin

- Status: accepted
- Date: 2026-07-17

## Decision

Serve target parser HTML and ResourceLoader JavaScript as a complete document on
a dedicated cookie-free origin. Embed it cross-origin with an iframe sandbox.
Never inject parser HTML into the editor DOM.

## Rationale

Faithful rendering requires active target modules and markup that cannot be
treated as trusted application UI. A separate origin contains script access,
storage, navigation, and CSP allowances. It also keeps future OAuth/session
cookies out of target-controlled code.

## Consequences

The preview needs a restrictive resource policy and read-only proxy in
production. Parent/child messages are untrusted and cannot perform privileged
actions. Some personalized features are intentionally unavailable.

Article links open in a new tab using `noopener noreferrer`. The iframe allows
popups so these links work, but does not allow popup sandbox escape or top-level
navigation. Linked tabs inherit the sandbox restrictions; target-site forms
and privileged browser features may therefore remain unavailable there.
Citation and other fragment-only links are resolved against the preview URL
and stay in the frame, rather than following the upstream wiki base URL.
