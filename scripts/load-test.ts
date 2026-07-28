import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

interface Scenario {
    readonly name: string;
    readonly url: URL;
    readonly status: number;
}

interface ScenarioResult extends Scenario {
    readonly durations: number[];
    readonly errors: string[];
    requests: number;
}

const apiBaseUrl = readBaseUrl('LOAD_API_BASE_URL', 'http://127.0.0.1:3000');
const previewBaseUrl = readBaseUrl(
    'LOAD_PREVIEW_BASE_URL',
    'http://127.0.0.1:4174',
);
const durationSeconds = readInteger('LOAD_DURATION_SECONDS', 8, 1, 300);
const concurrency = readInteger('LOAD_CONCURRENCY', 8, 1, 64);
const p95BudgetMilliseconds = readInteger(
    'LOAD_P95_MILLISECONDS',
    750,
    1,
    30_000,
);
const p99BudgetMilliseconds = readInteger(
    'LOAD_P99_MILLISECONDS',
    1_500,
    1,
    60_000,
);
const maximumErrorRate = readRatio('LOAD_MAX_ERROR_RATE', 0);
const requestTimeoutMilliseconds = readInteger(
    'LOAD_REQUEST_TIMEOUT_MILLISECONDS',
    5_000,
    100,
    60_000,
);

assertSafeTarget(apiBaseUrl);
assertSafeTarget(previewBaseUrl);

const scenarios: readonly Scenario[] = [
    { name: 'api-liveness', url: new URL('/healthz', apiBaseUrl), status: 200 },
    { name: 'api-readiness', url: new URL('/readyz', apiBaseUrl), status: 200 },
    {
        name: 'auth-availability',
        url: new URL('/v1/auth/availability', apiBaseUrl),
        status: 200,
    },
    {
        name: 'openapi-document',
        url: new URL('/openapi.json', apiBaseUrl),
        status: 200,
    },
    {
        name: 'preview-liveness',
        url: new URL('/healthz', previewBaseUrl),
        status: 200,
    },
    {
        name: 'preview-readiness',
        url: new URL('/readyz', previewBaseUrl),
        status: 200,
    },
    {
        name: 'preview-miss',
        url: new URL(`/previews/${'0'.repeat(32)}`, previewBaseUrl),
        status: 404,
    },
];

await warmUp(scenarios);

const deadline = performance.now() + durationSeconds * 1_000;
const results: ScenarioResult[] = scenarios.map((scenario) => ({
    ...scenario,
    durations: [],
    errors: [],
    requests: 0,
}));

await Promise.all(
    Array.from({ length: concurrency }, (_, worker) => runWorker(worker)),
);

const summaries = results.map((result) => summarize(result));
const aggregateDurations = results.flatMap((result) => result.durations);
const totalRequests = summaries.reduce(
    (total, result) => total + result.requests,
    0,
);
const totalErrors = summaries.reduce(
    (total, result) => total + result.errors,
    0,
);
const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    configuration: {
        concurrency,
        durationSeconds,
        maximumErrorRate,
        p95BudgetMilliseconds,
        p99BudgetMilliseconds,
        requestTimeoutMilliseconds,
    },
    aggregate: {
        errorRate: totalRequests === 0 ? 1 : totalErrors / totalRequests,
        errors: totalErrors,
        p95Milliseconds: percentile(aggregateDurations, 0.95),
        p99Milliseconds: percentile(aggregateDurations, 0.99),
        requests: totalRequests,
        requestsPerSecond: totalRequests / durationSeconds,
    },
    scenarios: summaries,
};

const failures = [];
if (report.aggregate.requests === 0) {
    failures.push('No requests completed.');
}
if (report.aggregate.errorRate > maximumErrorRate) {
    failures.push(
        `Error rate ${formatRatio(report.aggregate.errorRate)} exceeds ${formatRatio(maximumErrorRate)}.`,
    );
}
if (report.aggregate.p95Milliseconds > p95BudgetMilliseconds) {
    failures.push(
        `p95 ${report.aggregate.p95Milliseconds}ms exceeds ${p95BudgetMilliseconds}ms.`,
    );
}
if (report.aggregate.p99Milliseconds > p99BudgetMilliseconds) {
    failures.push(
        `p99 ${report.aggregate.p99Milliseconds}ms exceeds ${p99BudgetMilliseconds}ms.`,
    );
}

if (process.env.LOAD_REPORT_PATH?.trim()) {
    const output = resolve(process.env.LOAD_REPORT_PATH.trim());
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
        output,
        `${JSON.stringify({ ...report, failures }, null, 4)}\n`,
    );
}

process.stdout.write(`${JSON.stringify({ ...report, failures }, null, 4)}\n`);
if (failures.length > 0) {
    process.exitCode = 1;
}

async function runWorker(worker: number): Promise<void> {
    let iteration = worker;
    while (performance.now() < deadline) {
        const result = results[iteration % results.length];
        if (!result) {
            throw new Error('Load scenarios are not configured.');
        }
        iteration += 1;
        const startedAt = performance.now();
        try {
            const response = await fetch(result.url, {
                cache: 'no-store',
                headers: { 'User-Agent': 'WikiOne-Load-Gate/1.0' },
                redirect: 'error',
                signal: AbortSignal.timeout(requestTimeoutMilliseconds),
            });
            await response.arrayBuffer();
            if (response.status !== result.status) {
                result.errors.push(`http-${String(response.status)}`);
            }
        } catch (error) {
            result.errors.push(
                error instanceof Error ? error.name : 'request-failed',
            );
        } finally {
            result.requests += 1;
            result.durations.push(performance.now() - startedAt);
        }
    }
}

async function warmUp(values: readonly Scenario[]): Promise<void> {
    for (const scenario of values) {
        const response = await fetch(scenario.url, {
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(requestTimeoutMilliseconds),
        });
        await response.arrayBuffer();
        if (response.status !== scenario.status) {
            throw new Error(
                `${scenario.name} warm-up returned ${String(response.status)}; expected ${String(scenario.status)}.`,
            );
        }
    }
}

function summarize(result: ScenarioResult) {
    return {
        name: result.name,
        requests: result.requests,
        errors: result.errors.length,
        errorRate:
            result.requests === 0 ? 1 : result.errors.length / result.requests,
        p50Milliseconds: percentile(result.durations, 0.5),
        p95Milliseconds: percentile(result.durations, 0.95),
        p99Milliseconds: percentile(result.durations, 0.99),
    };
}

function percentile(values: readonly number[], ratio: number): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * ratio) - 1),
    );
    return Number((sorted[index] ?? 0).toFixed(2));
}

function readBaseUrl(name: string, fallback: string): URL {
    const value = process.env[name]?.trim() || fallback;
    const url = new URL(value);
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    ) {
        throw new TypeError(
            `${name} must be an HTTP(S) origin without credentials, a path, query, or fragment.`,
        );
    }
    return url;
}

function assertSafeTarget(url: URL): void {
    if (/\.?(?:wikipedia|wikimedia|mediawiki)\.org$/iu.test(url.hostname)) {
        throw new Error('The load gate refuses Wikimedia infrastructure.');
    }
    if (
        process.env.ALLOW_REMOTE_LOAD !== 'true' &&
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    ) {
        throw new Error(
            'Remote load tests require ALLOW_REMOTE_LOAD=true and an operator-approved environment.',
        );
    }
}

function readInteger(
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
): number {
    const value = process.env[name]?.trim();
    const parsed = value ? Number(value) : fallback;
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new RangeError(
            `${name} must be an integer from ${String(minimum)} to ${String(maximum)}.`,
        );
    }
    return parsed;
}

function readRatio(name: string, fallback: number): number {
    const value = process.env[name]?.trim();
    const parsed = value ? Number(value) : fallback;
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new RangeError(`${name} must be between 0 and 1.`);
    }
    return parsed;
}

function formatRatio(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
}
