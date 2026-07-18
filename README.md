# WikiOne

WikiOne is an Overleaf-style online editor for MediaWiki wikitext. Milestone 1
provides a responsive source/preview workspace for English Wikipedia with an
independently implemented wikitext editing layer and continuously refreshed,
target-rendered previews.

## Milestone 1 capabilities

- Side-by-side source and compiled-page panes with pointer and keyboard
  resizing; narrow screens use accessible Source/Preview tabs.
- A WikiOne-owned wikitext lexer, highlighter, diagnostics engine, outline,
  snippets, autocomplete, and selection-aware toolbar commands built on the
  permissively licensed CodeMirror 6 core.
- Anonymous English Wikipedia page loading and `action=parse` compilation with
  650 ms trailing debounce, cancellation, stale-result rejection, retry, parser
  warnings, and last-good-preview retention.
- Target parser HTML, images, tables, math, references, audio/video, styles, and
  ResourceLoader modules assembled into an isolated preview document.
- Source-only IndexedDB drafts with automatic save, restore, wiki/local version
  choice, and explicit discard.
- A fixed wiki registry, bounded/rate-limited API, opaque two-minute Redis
  preview bundles, and a separate cookie-free preview origin.

Authentication and publishing are deliberately unavailable until OAuth
registration is ready. Moegirlpedia is also outside the current English
Wikipedia MVP.

## Quick start

Requirements: Node.js 24 or newer and pnpm 11. For the source-development path,
a Redis instance must listen on `127.0.0.1:6379`.

```sh
pnpm install
docker compose up redis -d
pnpm dev
```

Open `http://127.0.0.1:5173`. The API and isolated preview service listen on
ports 3000 and 4174. Alternatively, Docker Compose builds and starts the entire
stack:

```sh
docker compose up --build
```

Run the offline repository and browser gates with:

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:live` intentionally contacts Wikimedia to reproduce the pinned
rendering-fidelity baseline. It is not part of ordinary offline tests.

See [development setup](docs/development.md), the
[Milestone 1 checklist](docs/milestone-1-checklist.md), and the
[documentation index](docs/README.md).

## License

WikiOne is available under the [MIT License](LICENSE). The wikitext editor was
implemented independently; no Wikimedia CodeMirror extension source is copied
or adapted into this repository.
