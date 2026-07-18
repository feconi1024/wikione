# Independent wikitext editor

## Decision and purpose

WikiOne implements its own wikitext language layer in
`packages/wikitext-editor`. It uses the MIT-licensed CodeMirror 6 editing engine
for document/view primitives but does not copy or adapt Wikimedia's GPL
CodeMirror extension. This keeps WikiOne's MIT distribution boundary intact and
lets the UX prioritize continuous split-pane editing.

The local language layer is an editing aid, not an alternative MediaWiki
parser. Only the target wiki's `action=parse` result defines compiled meaning.

## Implemented behavior

- Lossless, error-tolerant tokenization: every source character is preserved,
  including malformed/incomplete input while the user types.
- Highlighting for headings, comments, templates/parameters, internal/external
  links, formatting, magic words, tags, URLs, lists, and wiki tables.
- Opaque handling for `nowiki`, `pre`, `source`, `syntaxhighlight`, and `math`
  bodies so their delimiter-like text does not create false nesting errors.
- Diagnostics for unclosed/mismatched templates, parameters, links, comments,
  opaque tags, and tables.
- A heading outline with click-to-focus navigation.
- Autocomplete/snippets plus selection-aware bold, italic, heading, internal
  link, template, reference, bulleted/numbered list, and table commands.
- Line numbers, history, search, folding, bracket support, keyboard navigation,
  and an explicitly named accessible textbox.

The lexer and analyzer are Unicode-safe and covered by multilingual, nested,
opaque-tag, and malformed-source tests. Commands operate by deterministic source
replacement and never silently normalize unrelated wikitext.

## Compatibility boundary

Wikitext is context-sensitive and wiki-specific. Milestone 1 does not attempt
to locally expand templates, execute Lua, resolve redirects, evaluate parser
functions, fetch template data, or duplicate extension-specific parse rules.
Those behaviors belong to the target parser and appear in the live preview.

Diagnostics are intentionally conservative. A missing local diagnostic does
not prove valid wikitext, and a parser warning can still appear after local
analysis succeeds. Future editor work should add fixture-driven constructs
incrementally rather than reconstructing MediaWiki parsing semantics in the
browser.

## Maintenance and licensing

`@codemirror/*` and `@lezer/highlight` runtime dependencies used here are MIT
licensed. WikiOne-owned source is MIT. Wikimedia editor source remains an
interoperability reference only; copied/adapted copyleft code requires an
explicit project-license decision and must not enter the current package.

This choice costs more syntax-maintenance work and may lag obscure wiki
extensions, but it preserves UX control, avoids a bundled-license conflict, and
keeps target compilation authoritative.
