# ADR 0006: Opaque ephemeral preview delivery

- Status: accepted
- Date: 2026-07-19

## Decision

Compile through the BFF, store the complete preview document in Redis under a
random 192-bit ID for two minutes, return only an expiring render URL, and serve
that document from a dedicated cookie-free preview application.

## Rationale

Target parser HTML and ResourceLoader JavaScript must remain outside the editor
origin. Returning HTML in editor JSON would invite accidental DOM insertion;
durable or guessable storage would increase draft-disclosure risk.

## Consequences

The preview service exposes only health and opaque GET routes, validates ID
shape and expiry, sets isolation headers, and cannot authenticate or publish.
Redis is runtime infrastructure for rendered bundles, not a draft database.
Public deployment must preserve distinct HTTPS origins and exact frame/CORS
configuration.
