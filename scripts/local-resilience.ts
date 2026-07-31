import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

interface ProbeResult {
    readonly attempts: number;
    readonly durationMilliseconds: number;
    readonly status: number;
    readonly url: string;
}

const apiLiveness = new URL('http://127.0.0.1:3000/livez');
const apiReadiness = new URL('http://127.0.0.1:3000/readyz');
const previewLiveness = new URL('http://127.0.0.1:4174/livez');
const previewReadiness = new URL('http://127.0.0.1:4174/readyz');
const evidence: Record<string, ProbeResult[]> = {
    baseline: [],
    outage: [],
    recovery: [],
};
let redisStopped = false;
let failure: unknown;

try {
    evidence.baseline?.push(
        await waitForStatus(apiReadiness, 200),
        await waitForStatus(previewReadiness, 200),
    );

    compose(['stop', '--timeout', '10', 'redis']);
    redisStopped = true;

    evidence.outage?.push(
        await waitForStatus(apiLiveness, 200),
        await waitForStatus(previewLiveness, 200),
    );
    const apiUnavailable = await waitForStatus(apiReadiness, 503);
    const previewUnavailable = await waitForStatus(previewReadiness, 503);
    evidence.outage?.push(apiUnavailable, previewUnavailable);
    await assertRetryAfter(apiReadiness);
    await assertRetryAfter(previewReadiness);
} catch (error) {
    failure = error;
} finally {
    if (redisStopped) {
        try {
            compose(['start', 'redis']);
            evidence.recovery?.push(
                await waitForStatus(apiReadiness, 200, 45_000),
                await waitForStatus(previewReadiness, 200, 45_000),
            );
        } catch (recoveryError) {
            failure = new AggregateError(
                [failure, recoveryError].filter(
                    (value): value is NonNullable<typeof value> =>
                        value !== undefined,
                ),
                'The Redis drill failed and automatic recovery did not complete.',
            );
        }
    }
}

if (failure !== undefined) {
    process.stderr.write(
        `${JSON.stringify(
            {
                status: 'failed',
                checkedAt: new Date().toISOString(),
                evidence,
                error:
                    failure instanceof Error
                        ? failure.message
                        : 'Unknown resilience-drill failure.',
            },
            undefined,
            4,
        )}\n`,
    );
    process.exitCode = 1;
} else {
    process.stdout.write(
        `${JSON.stringify(
            {
                status: 'passed',
                checkedAt: new Date().toISOString(),
                scenario:
                    'Redis outage preserves liveness, fails readiness, and recovers automatically.',
                evidence,
            },
            undefined,
            4,
        )}\n`,
    );
}

function compose(args: readonly string[]): void {
    const result = spawnSync('docker', ['compose', ...args], {
        encoding: 'utf8',
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        throw new Error(
            `docker compose ${args.join(' ')} exited with ${String(result.status)}.`,
        );
    }
}

async function waitForStatus(
    url: URL,
    expectedStatus: number,
    timeoutMilliseconds = 20_000,
): Promise<ProbeResult> {
    const startedAt = performance.now();
    let attempts = 0;
    let lastStatus: number | undefined;
    while (performance.now() - startedAt < timeoutMilliseconds) {
        attempts += 1;
        try {
            const response = await fetch(url, {
                cache: 'no-store',
                redirect: 'error',
                signal: AbortSignal.timeout(2_000),
            });
            lastStatus = response.status;
            await response.arrayBuffer();
            if (response.status === expectedStatus) {
                return {
                    attempts,
                    durationMilliseconds: Number(
                        (performance.now() - startedAt).toFixed(2),
                    ),
                    status: response.status,
                    url: url.toString(),
                };
            }
        } catch {
            lastStatus = undefined;
        }
        await delay(250);
    }
    throw new Error(
        `${url.toString()} did not reach ${String(expectedStatus)}; last status was ${lastStatus === undefined ? 'unavailable' : String(lastStatus)}.`,
    );
}

async function assertRetryAfter(url: URL): Promise<void> {
    const response = await fetch(url, {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(2_000),
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '5');
    await response.arrayBuffer();
}

async function delay(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
