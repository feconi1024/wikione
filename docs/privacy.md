# Privacy notice and data inventory

This document describes implemented Milestone 2 behavior and is the source for
the user-facing `/privacy` page. It is not legal advice.

## Data handled now

### WikiOne accounts

Registration stores a random account ID, username, normalized username, display
name, salted scrypt password hash, and created/updated timestamps in PostgreSQL.
The initial workflow does not collect an email address. Passwords are processed
only for verification/hashing and are never logged or stored reversibly.

Users can change their display name/password, revoke every session, and delete
the account. Password change revokes previous sessions. Account deletion removes
the account record and active session keys immediately from application stores.
Database backups, if enabled by a public operator, need a separately published
retention schedule.

### Sessions

The browser receives a random HTTP-only host cookie. Redis uses an HMAC lookup
key and stores the session payload encrypted with AES-256-GCM. The payload
contains account ID, session-family ID, CSRF value, issue/expiry times, and
rotation generation. Default idle expiry is 30 minutes; absolute expiry is eight
hours. Refresh rotates the token. Logout, logout-all, password change, replay
detection, and deletion revoke sessions.

### Browser drafts

IndexedDB stores wiki ID, title, current wikitext, exact base wikitext/revision,
and update time. Drafts stay in that browser profile until **Discard saved
copy**, site-data clearing, or browser removal. They are not synchronized to the
WikiOne account and cannot be recovered by the operator.

### Page loading, review, and compilation

Page title loading and latest-revision checks cause anonymous requests from the
BFF to English Wikipedia. Line diff and three-way merge run locally; proposed
source is not sent upstream merely to display a review. Preview compilation
sends title and proposed wikitext to the target wiki's anonymous parser.

The BFF does not durably store raw source. Rendered preview HTML, wiki base URL,
and creation/expiry times live in Redis for two minutes by default. The preview
iframe loads wiki styles, scripts, images, audio, and video directly, so those
operators receive ordinary browser network metadata under their policies.

### Wikimedia accounts and edits

No Wikimedia account identity, authorization code, access/refresh token, edit,
or created revision is stored. Public OAuth and publishing are disabled. The
WikiOne login never authorizes a wiki edit.

### Logs

Source-bearing application request logging is disabled. Safe errors expose
request IDs and normalized codes. Passwords, cookies, tokens, encrypted session
contents, usernames, titles, source, summaries, parser HTML, and raw upstream
responses are excluded by design. Public infrastructure must preserve these
restrictions and publish its metadata retention.

## Retention and controls

| Data                       | Default retention/control                                              |
| -------------------------- | ---------------------------------------------------------------------- |
| PostgreSQL account         | Until password-confirmed account deletion                              |
| Redis session              | 30-minute idle / 8-hour absolute maximum; explicit revocation controls |
| Browser draft/base source  | Until discard or browser/site-data removal                             |
| Redis preview document     | 120 seconds by default; at most 10 minutes                             |
| Raw source in BFF          | Request processing only                                                |
| Wikimedia tokens/revisions | Not collected while approval is pending                                |

## Public-release work

Before operating a public account service, the operator must publish its legal
identity/contact, jurisdiction-specific terms, backup/log retention, incident
response, subprocessors, security contact, and account-data request process.
Before enabling Wikimedia OAuth, this notice must add token retention,
revocation, connected identity fields, external callback behavior, and the
public revision created by an edit.
