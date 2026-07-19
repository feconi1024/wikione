# ADR 0004: MIT license and copyleft boundary

- Status: accepted
- Date: 2026-07-17

## Decision

License WikiOne under MIT as required by the repository instructions. Do not copy
or adapt GPL-licensed MediaWiki CodeMirror extension source into this repository.

## Rationale

The earlier product plan considered a GPL-compatible application, but the
authoritative repository requirement specifies MIT. Combining copied GPL source
with an MIT-only distribution would create a licensing conflict.

## Consequences

Future wikitext language support must be independently implemented or use a
permissively licensed dependency. Official Wikimedia behavior may be studied as
an interoperability reference, but source copying requires a separate licensing
decision and explicit repository-instruction change.

Milestone 2 uses `node-diff3` 3.2.1 under MIT and `diff` 8.0.4 under
BSD-3-Clause for isolated text merge/review algorithms. Both are permissive and
compatible with WikiOne's MIT distribution. Reconstructing those mature
algorithms would add correctness risk without resolving a license conflict, so
the project license remains MIT.
