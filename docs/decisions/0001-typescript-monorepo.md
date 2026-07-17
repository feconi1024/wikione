# ADR 0001: TypeScript pnpm monorepo

- Status: accepted
- Date: 2026-07-17

## Decision

Use a pnpm workspace coordinated by Turborepo, strict TypeScript, Node.js 24 LTS,
and small independently buildable apps/packages. Runtime schemas use Zod.

## Rationale

The editor, BFF, preview service, and MediaWiki adapter share contracts but have
different trust and deployment boundaries. Workspace packages preserve those
boundaries without premature microservice infrastructure. A single lockfile and
topological build keep versions reproducible.

## Consequences

Workspace package type exports point to source for clean-checkout tooling, while
runtime exports point to compiled output. CI must run formatting, linting,
typechecking, tests, builds, and container construction.
