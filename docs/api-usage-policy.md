# Wikimedia API usage checklist

WikiOne is an operator of API traffic and must follow Wikimedia's API Usage and
User-Agent policies.

## Implemented in Milestone 0

- [x] HTTPS-only Action API endpoints.
- [x] Descriptive `User-Agent` and `Api-User-Agent` identifying WikiOne and its
      public repository.
- [x] `maxlag=5` on every request.
- [x] Fifteen-second request timeout.
- [x] Sequential live fixture execution; no burst concurrency.
- [x] Explicit live test command excluded from ordinary unit tests and CI.
- [x] Structured handling of API and HTTP errors without logging bodies.
- [x] Pinned revisions prevent repeated discovery calls and content drift.
- [x] Generated results are cached locally for developer inspection rather than
      repeatedly fetched automatically.

## Required before public beta

- [ ] Replace the repository-only contact with a monitored operator address.
- [ ] Coalesce preview changes and permit one in-flight parse per document.
- [ ] Enforce a trailing debounce and sustained request ceiling.
- [ ] Honor `Retry-After`, 429, `maxlag`, and 503 with exponential backoff and
      jitter.
- [ ] Add global/per-session rate limits and an adaptive upstream concurrency
      queue.
- [ ] Cache identical content hashes briefly without retaining wikitext in logs.
- [ ] Publish dashboards for upstream latency, errors, throttling, and cache
      behavior.
- [ ] Recheck Wikimedia policies immediately before beta and record the review
      date.

## Operator rules

- Never distribute load across identities or addresses to evade throttling.
- Never claim Wikimedia guarantees service availability.
- Do not run the live fixture command in tight loops or on every commit.
- Stop or reduce traffic when Wikimedia requests it.
- Comply with content licenses when retaining or redistributing page output.
