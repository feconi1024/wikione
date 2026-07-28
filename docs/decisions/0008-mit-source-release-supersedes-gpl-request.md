# ADR 0008: MIT source release supersedes the Milestone 3 GPL request

- Status: accepted
- Date: 2026-07-28
- Supersedes: [ADR 0004](0004-mit-copyleft-boundary.md)

## Context

Two owner-authored documents disagreed about WikiOne's distribution license, and
Milestone 3 could not close while the conflict stayed open.

- The product plan describes a "GPL-2.0-or-later web application" and lists a
  "GPL source repository" among the Milestone 3 artifacts.
- The standing repository instructions require a `LICENSE` file declaring the
  **MIT License**.

Every artifact in the repository already implements the second requirement: the
root `LICENSE`, the root manifest, and all fourteen workspace package manifests
declare MIT. ADR 0004 recorded that position but framed it as provisional,
leaving the release checklist blocked on an unresolved governance item.

## Decision

WikiOne is released under the **MIT License**. The repository instruction is
authoritative and the plan's GPL wording does not apply.

The Milestone 3 artifact "GPL source repository" is satisfied by publishing the
complete corresponding source of every released build under WikiOne's actual
license. The intent behind that artifact — that users of a deployed public beta
can obtain, audit, and rebuild the exact source of the binaries served to them —
is met in full by the MIT release. MIT grants strictly broader downstream
permissions than GPL-2.0-or-later, so no recipient receives fewer rights than
the plan intended.

## Rationale

Relicensing to GPL-2.0-or-later would require copyright authority over every
contribution and would deliver no capability the milestone actually asks for.
The reproducibility, provenance, SBOM, and notice obligations that make a source
release meaningful are license-independent and are already implemented in
[the release process](../release-process.md) and
[reproducible builds](../reproducible-builds.md).

The copyleft boundary that motivated ADR 0004 is unchanged and remains binding.

## Consequences

- `LICENSE`, the root manifest, and all workspace manifests stay MIT. No
  relicensing, dual-licensing, or SPDX expression change occurs.
- The Milestone 3 checklist item for license reconciliation is closed by this
  ADR rather than by an external approval.
- The prohibition carried over from ADR 0004 stands: WikiOne must not copy or
  adapt GPL-licensed MediaWiki CodeMirror extension source. Wikitext language
  support remains independently implemented, as recorded in
  [ADR 0005](0005-independent-wikitext-editor.md). Official Wikimedia behavior
  may be studied as an interoperability reference only.
- Permissively licensed dependencies remain acceptable. Milestone 2's
  `node-diff3` (MIT) and `diff` (BSD-3-Clause) stay in place.
- Introducing any copyleft-licensed dependency or source into the distribution
  requires a new superseding ADR and an explicit owner decision.
