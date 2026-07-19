# ADR 0007: Separate WikiOne and Wikimedia identities

- Status: accepted
- Date: 2026-07-19

## Decision

Implement a first-party WikiOne username/password account system for local
identity and account preferences. Represent Wikimedia authorization as a
separate connected-app capability. A WikiOne session never authorizes a
MediaWiki edit.

Persist account records in PostgreSQL. Keep short-lived, encrypted session
records in Redis and send only an opaque identifier in an HTTP-only cookie.
Retain distinct editor/API and cookie-free preview trust boundaries.

Until a public Wikimedia OAuth consumer is approved, every OAuth and real-wiki
write entry point returns a stable approval-pending response and performs no
token exchange or upstream mutation. Publishing-domain logic is exercised
through a replaceable provider port and test provider.

## Rationale

OAuth registration is controlled by an external reviewer and cannot be
completed by repository automation. Coupling WikiOne accounts to that gate
would prevent complete account workflows, while treating a local login as wiki
authorization would be a serious privilege-boundary error.

Durable accounts and ephemeral sessions have different lifecycle and query
requirements. PostgreSQL provides constraints and migrations for accounts;
Redis provides bounded session expiry and revocation. Encryption limits the
impact of accidental Redis value disclosure, while hashed lookup keys avoid
storing raw browser tokens.

## Consequences

The UI must say both whether a user is signed in to WikiOne and whether a
Wikimedia account is connected. Authentication contracts use provider-specific
identity shapes. The connected-apps and privacy views are release-critical.

Public Wikimedia publishing remains externally blocked, even when all local
review, merge, error-presentation, and publisher-port tests pass. Enabling the
adapter later requires consumer approval, secret management, token encryption,
callback validation, and an updated security audit.
