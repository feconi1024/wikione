import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { createPasswordHasher } from '../packages/auth-core/dist/index.js';

const operations = readInteger('PASSWORD_BENCHMARK_OPERATIONS', 4, 1, 20);
const concurrency = readInteger('PASSWORD_BENCHMARK_CONCURRENCY', 2, 1, 4);
const p95BudgetMilliseconds = readInteger(
    'PASSWORD_BENCHMARK_P95_MILLISECONDS',
    2_500,
    100,
    30_000,
);
const password = 'public-beta benchmark passphrase';
const hasher = createPasswordHasher();
const durations: number[] = [];
let nextOperation = 0;
const startingRssBytes = process.memoryUsage().rss;

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const endingRssBytes = process.memoryUsage().rss;
const p95Milliseconds = percentile(durations, 0.95);
const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    algorithm: 'scrypt',
    parameters: { N: 131_072, r: 8, p: 1 },
    operations,
    concurrency,
    p50Milliseconds: percentile(durations, 0.5),
    p95Milliseconds,
    maximumMilliseconds: Number(Math.max(...durations).toFixed(2)),
    rssDeltaMiB: Number(
        ((endingRssBytes - startingRssBytes) / 1024 / 1024).toFixed(2),
    ),
    p95BudgetMilliseconds,
    passed: p95Milliseconds <= p95BudgetMilliseconds,
};

if (process.env.PASSWORD_BENCHMARK_REPORT_PATH?.trim()) {
    const output = resolve(process.env.PASSWORD_BENCHMARK_REPORT_PATH.trim());
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 4)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 4)}\n`);
if (!report.passed) {
    process.exitCode = 1;
}

async function worker(): Promise<void> {
    while (nextOperation < operations) {
        nextOperation += 1;
        const startedAt = performance.now();
        const encoded = await hasher.hash(password);
        if (!(await hasher.verify(password, encoded))) {
            throw new Error('Production password hash verification failed.');
        }
        durations.push(performance.now() - startedAt);
    }
}

function percentile(values: readonly number[], ratio: number): number {
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * ratio) - 1),
    );
    return Number((sorted[index] ?? 0).toFixed(2));
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
