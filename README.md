# WikiOne

WikiOne is an Overleaf-style online editor for MediaWiki wikitext. The product
will place source and the target wiki's compiled page side by side, continuously
refresh the preview, and publish through the user's existing wiki account.

This repository currently contains the Milestone 0 platform foundation:

- a TypeScript/pnpm monorepo and CI baseline;
- versioned API contracts for previewing and publishing;
- a MediaWiki `action=parse` rendering spike;
- an isolated preview server and representative fidelity fixtures;
- architecture, security, privacy, and API-stewardship documentation.

## Quick start

Requirements: Node.js 24 or newer and pnpm 11.

```sh
pnpm install
pnpm check
pnpm build
pnpm spike:render
pnpm spike:serve
```

Generated spike pages are written to `artifacts/render-spike/` and are not
committed. The live validation command contacts Wikimedia APIs:

```sh
pnpm test:live
```

See [docs/development.md](docs/development.md) for setup details and
[docs/milestone-0-checklist.md](docs/milestone-0-checklist.md) for scope and
evidence.

## License

WikiOne is available under the [MIT License](LICENSE). Copyleft source is not
copied into this repository; later wikitext language support must be implemented
independently or use an MIT/Apache/BSD-compatible dependency.
