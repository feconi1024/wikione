# ADR 0002: Compile with the target wiki parser

- Status: accepted
- Date: 2026-07-17

## Decision

Send preview wikitext to the selected wiki's `action=parse` endpoint and use its
HTML, page configuration, warnings, and ResourceLoader modules. Do not implement
an independent client-side renderer for authoritative preview output.

## Rationale

Templates, Lua modules, magic words, files, language conversion, parser tags,
site configuration, and installed extensions are target-specific and mutable. A
local parser cannot reproduce them reliably. The target parser is also the only
credible path to the requested media and final-page fidelity.

## Consequences

Preview requires network access and sends unpublished wikitext to the target
wiki. Traffic must be debounced, identified, cached responsibly, and rate-aware.
The UI must retain the last successful preview during upstream failure.
