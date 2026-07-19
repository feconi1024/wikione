# Wikimedia API usage checklist

WikiOne operates API traffic and must follow the current target wiki's API and
User-Agent policies.

## Implemented through Milestone 2

- [x] Fixed HTTPS-only Action API endpoint for English Wikipedia.
- [x] Descriptive `User-Agent` and `Api-User-Agent` identifying WikiOne and its
      public repository.
- [x] `maxlag=5`, 15-second timeout, POST requests, and redirect rejection.
- [x] Structured API/HTTP errors without logging bodies or submitted source.
- [x] 650 ms trailing browser debounce, superseded-request abort, and stale
      client-revision rejection.
- [x] Preview source/body size limits and a 30 requests/minute per-instance/IP
      API ceiling.
- [x] Pinned live fixtures run sequentially only through an explicit command,
      outside ordinary tests and CI.
- [x] Target results are inspected through ephemeral previews instead of
      repeatedly fetched background jobs.
- [x] Latest-revision and publish-preparation checks are user-triggered,
      rate-limited, fixed-registry anonymous reads; no background polling or
      authenticated write exists.

## Required before public beta

- [ ] Replace the repository-only/local User-Agent contact with a monitored
      operator address.
- [ ] Honor `Retry-After`, 429, `maxlag`, and 503 with bounded exponential
      backoff and jitter.
- [ ] Add a shared upstream concurrency queue and distributed limits for
      multi-instance deployments.
- [ ] Consider a short-lived identical-content cache without source-aware keys
      or logs.
- [ ] Publish metadata-only dashboards for latency, errors, throttling, and
      request volume.
- [ ] Recheck target policies immediately before beta and record the review
      date/operator.

## Operator rules

- Never distribute load across identities or addresses to evade throttling.
- Never claim Wikimedia guarantees availability or preview completeness.
- Do not run live fixtures in tight loops or on every commit.
- Stop or reduce traffic when a target operator requests it.
- Comply with content licenses when retaining or redistributing page output.
