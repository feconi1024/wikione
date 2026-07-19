# WikiOne

WikiOne is an Overleaf-style online editor for MediaWiki wikitext. It combines
a responsive source/compiled-page workspace with local drafts, first-party
WikiOne accounts, source review, latest-revision checks, and three-way conflict
resolution for an English Wikipedia MVP.

## Milestone 2 capabilities

- Side-by-side source and target-rendered page panes, continuously recompiled
  after edits; narrow screens use accessible Source/Preview tabs.
- Independent wikitext highlighting, diagnostics, outline, snippets,
  autocomplete, and toolbar commands built on permissively licensed CodeMirror
  core packages.
- Wikipedia parser fidelity for images, tables, math, references, audio/video,
  styles, and ResourceLoader modules inside an isolated preview origin.
- Source/base-snapshot IndexedDB drafts with autosave, restore, remote/local
  choice, discard, and lossless conflict input.
- First-party username/password accounts in PostgreSQL with scrypt hashes,
  encrypted Redis sessions, CSRF/Origin protection, refresh, logout/logout-all,
  identity/profile/password controls, and deletion.
- User-facing connected-app and privacy pages that distinguish WikiOne identity
  from Wikimedia authorization.
- Semantic line diff, required edit summary, minor/watchlist choices,
  latest-revision create/update preflight, and explicit mine/latest/manual
  three-way conflict resolution.
- A fake-tested publisher boundary covering create-only/update safeguards,
  post-write revision verification, and normalized AbuseFilter/CAPTCHA errors.

Public Wikimedia OAuth approval is still required. Wikimedia connection and
real publishing remain hard-disabled: the UI explains the gate, placeholder
routes return 503, and the runtime has no authenticated MediaWiki write adapter.
Moegirlpedia remains outside the English Wikipedia MVP.

## Quick start

Requirements: Node.js 24 or newer, pnpm 11, PostgreSQL 17, and Redis 7.

```sh
pnpm install
docker compose up postgres redis -d
pnpm dev
```

Open `http://127.0.0.1:5173`. The API and isolated preview service listen on
ports 3000 and 4174. Alternatively, build and start the complete stack:

```sh
docker compose up --build
```

Run repository and browser gates with:

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:live` intentionally contacts Wikimedia to reproduce the pinned
rendering-fidelity baseline; ordinary tests do not contact or edit any wiki.

See [development setup](docs/development.md), the
[Milestone 2 checklist](docs/milestone-2-checklist.md), and the
[documentation index](docs/README.md).

## License

WikiOne is available under the [MIT License](LICENSE). The wikitext editor was
implemented independently; no Wikimedia CodeMirror extension source is copied
or adapted. Milestone 2's text algorithms use the compatible MIT-licensed
`node-diff3` and BSD-3-Clause-licensed `diff` packages, so changing WikiOne's
license is neither required nor recommended for this architecture.
