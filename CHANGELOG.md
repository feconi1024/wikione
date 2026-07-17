# Changelog

All notable changes to WikiOne are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Initial pnpm/Turborepo TypeScript workspace.
- CI, formatting, linting, container-development, and test foundations.
- Shared, versioned Zod contracts for wikis, page sources, previews, and
  publishing.
- MediaWiki Action API client for pinned revision retrieval and preview parsing.
- Isolated preview-document assembly with ResourceLoader module bootstrapping.
- Minimal Fastify backend with health, contract metadata, and generated OpenAPI.
- Reproducible API container and Redis development composition.
- Live rendering spike with pinned English, Chinese, and Arabic Wikipedia
  revisions plus a controlled media fixture.
- Cookie-free preview server with sandbox-oriented headers and CSP.
