# Privacy notice and data inventory

This document describes implemented Milestone 1 behavior and is a draft basis
for a future public-service notice. It is not legal advice.

## Data handled now

### Browser drafts

The editor stores a versioned local draft in IndexedDB after edits. A record
contains wiki ID, title, wikitext, update time, and optional base revision. It
does not contain compiled HTML, account data, cookies, or credentials. Drafts
remain in that browser profile until the user selects **Discard saved copy**,
clears site data, or browser storage is removed.

### Page loading and compilation

When the user loads a page, the WikiOne BFF sends the title anonymously to the
fixed English Wikipedia Action API and returns its current wikitext/revision.
When source changes, the BFF sends the title and draft wikitext to English
Wikipedia for anonymous `action=parse` compilation. The editor discloses this
in its persistent privacy bar.

The BFF does not durably store raw source. It creates a rendered HTML document
and stores that document, the wiki base origin, and creation/expiry times in
Redis for two minutes. The browser receives only a random render URL. Supplied
Compose configuration disables Redis snapshots and append-only persistence.

The preview iframe loads Wikipedia/Wikimedia styles, scripts, images, audio,
video, and other resources directly. Those operators can receive normal request
metadata such as IP address, time, URL, and browser headers under their own
policies. In a hosted deployment, the parse request originates from WikiOne's
server while iframe resource requests originate from the user's browser.

### Logs and accounts

Source-bearing Fastify request logging is disabled. Application errors expose
only request IDs and normalized codes; titles, wikitext, parser HTML, summaries,
cookies, and tokens are excluded by design. Infrastructure access logs must use
the same restriction in a hosted deployment.

Milestone 1 has no product analytics, advertising, tracking, user accounts,
OAuth tokens, server sessions, email addresses, usernames, or publishing data.
The disabled sign-in control and auth-availability response are placeholders
only.

## User controls and retention

| Data                            | Current retention/control                                             |
| ------------------------------- | --------------------------------------------------------------------- |
| Browser source draft            | Until explicit discard or browser/site-data removal                   |
| Redis rendered preview document | 120 seconds by default; at most 10 minutes by configuration           |
| Raw source in the BFF           | Request processing only; not written to application storage           |
| Generated render-spike files    | Ignored local artifacts; developer deletes them when no longer needed |
| Account/session/token data      | Not collected or created in Milestone 1                               |

Browser drafts are not synchronized and cannot be recovered by a WikiOne
operator. Discarding a saved copy does not erase the text still open in the
current editor tab.

## Work required before public authentication

After OAuth registration, this notice must be reviewed for token/session
storage, logout, revocation, operator log retention, incident response, and the
wiki revision created by publishing. Before registration approval, no OAuth
secret or functional auth/write path should be added.
