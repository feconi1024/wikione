# Load and resilience gate

The load gate targets only an operator-controlled WikiOne stack. It refuses
Wikimedia hostnames and refuses any non-loopback target unless
`ALLOW_REMOTE_LOAD=true` is set deliberately.

`scripts/load-test.ts` drives five source-free endpoints: API liveness,
authentication availability, the OpenAPI document, preview liveness, and an
opaque preview miss. It does not compile a page and therefore cannot amplify
traffic to Wikipedia. Defaults are eight concurrent workers for eight seconds,
zero tolerated errors, p95 below 750 ms, and p99 below 1,500 ms.

`scripts/benchmark-password.ts` separately measures the real production
scrypt parameters with bounded concurrency. This makes password-hash pressure
visible without bypassing route rate limits or retaining a test password.

Run against the local Compose API and preview services:

```sh
docker compose up --build --detach api preview
pnpm test:load
docker compose stop api preview postgres redis
```

For staging, set the exact API/preview origins, enable the remote safety latch,
and retain JSON reports as release artifacts:

```sh
ALLOW_REMOTE_LOAD=true \
LOAD_API_BASE_URL=https://api.staging.example \
LOAD_PREVIEW_BASE_URL=https://preview.staging.example \
LOAD_REPORT_PATH=artifacts/load/http.json \
PASSWORD_BENCHMARK_REPORT_PATH=artifacts/load/password.json \
pnpm test:load
```

Increase concurrency or duration only with operator approval. Public Wikimedia
endpoints are never valid load-test targets.
