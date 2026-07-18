# ADR 0005: Independent wikitext editor layer

- Status: accepted
- Date: 2026-07-19

## Decision

Build WikiOne's lossless wikitext lexer, diagnostics, commands, outline, and
CodeMirror extensions independently on the MIT-licensed CodeMirror 6 core. Do
not use or adapt Wikimedia's GPL CodeMirror extension in the MIT repository.

## Rationale

WikiOne needs editing behavior optimized for an Overleaf-style continuous
source/preview workflow. An independent language layer preserves UX control and
the required license boundary while leaving semantic compilation to each target
wiki's parser.

## Consequences

WikiOne owns ongoing syntax fixtures and compatibility maintenance. Local
diagnostics are advisory and conservative; they will not reproduce template,
Lua, or extension semantics. New syntax support must remain lossless,
error-tolerant, permissively licensed, and covered by malformed/multilingual
tests.
