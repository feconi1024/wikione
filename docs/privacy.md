# Privacy notice and data inventory

This document is both the Milestone 0 data inventory and the draft basis for the
public product privacy notice. It is not legal advice.

## Milestone 0 behavior

The rendering spike sends these values to the selected Wikimedia Action API:

- a pinned revision ID or controlled fixture wikitext;
- page title/context needed for correct template and magic-word expansion;
- requested skin, parser properties, and a descriptive WikiOne User-Agent.

Wikimedia receives the requester's network metadata according to its own privacy
policy and infrastructure. WikiOne does not authenticate these requests.

The spike writes compiled HTML and a manifest to local
`artifacts/render-spike/`. The manifest contains wiki/API URLs, titles, pinned
revision IDs/timestamps, source character counts, module names, parser warnings,
and structural media counts. It does not contain source wikitext or credentials.
The directory is ignored and may be deleted at any time.

## Planned MVP behavior

- Drafts remain in the user's browser through IndexedDB unless the user clears
  them.
- Draft wikitext is sent to the selected wiki for compilation; this is shown in
  the UI before first use.
- The BFF stores only encrypted OAuth access/refresh tokens and opaque session
  metadata in Redis for the login lifetime.
- Preview bundles are ephemeral, unlisted, `no-store`, and deleted after a short
  TTL.
- No advertising, cross-site tracking, or product analytics are enabled by
  default.
- Operational logs exclude page titles, source, parser HTML, edit summaries,
  usernames, email addresses, and all credentials.

## User controls

Users can discard local drafts, log out to remove the server session, and revoke
the connected application from Wikimedia's OAuth grants page. Publishing creates
the normal public wiki revision and is governed by that wiki's history, license,
and deletion policies.

## Retention defaults

- Browser draft: until discard, successful matching publication, or browser
  storage removal.
- OAuth/session record: at most 30 days and never beyond refresh-token validity.
- Preview bundle: two minutes.
- Security/availability logs: 14 days, metadata only.

Before public OAuth approval, replace placeholder contact/domain values, publish
the final notice at a stable HTTPS URL, and confirm retention with the deployment
operator.
