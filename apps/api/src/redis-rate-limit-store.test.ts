import { afterEach, describe, expect, it } from 'vitest';

import type { SessionKeyRing } from '@wikione/auth-core';

import { buildApi } from './app.js';
import { createRateLimitStoreResource } from './redis-rate-limit-store.js';

const sessionKeyRing = {
    activeKeyId: 'test',
    encryptionKeys: { test: Buffer.alloc(32, 1) },
    lookupHmacKey: Buffer.alloc(32, 2),
} satisfies SessionKeyRing;

const openApps: Awaited<ReturnType<typeof buildApi>>[] = [];

afterEach(async () => {
    await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('Redis API rate limits', () => {
    it('shares atomic route counters across API instances without storing client addresses', async () => {
        const backend = new FakeRedisBackend();
        const first = await createApi(backend);
        const second = await createApi(backend);

        const readiness = await first.inject({ method: 'GET', url: '/readyz' });
        expect(readiness.json()).toEqual({
            status: 'ready',
            checks: {
                'authentication-store': 'ready',
                'preview-store': 'ready',
                'rate-limit-store': 'ready',
            },
        });

        for (let index = 0; index < 12; index += 1) {
            const response = await (index % 2 === 0 ? first : second).inject({
                method: 'POST',
                url: '/v1/auth/refresh',
            });
            expect(response.statusCode).toBe(403);
        }

        const exceeded = await second.inject({
            method: 'POST',
            url: '/v1/auth/refresh',
        });
        expect(exceeded.statusCode).toBe(429);
        expect(exceeded.json()).toMatchObject({
            code: 'rate-limit-exceeded',
        });
        expect(backend.seenKeys).toHaveLength(13);
        expect(
            backend.seenKeys.every(
                (key) =>
                    key.startsWith('wikione:rate-limit:') &&
                    !key.includes('127.0.0.1'),
            ),
        ).toBe(true);
    });

    it('fails limited requests closed and reports Redis readiness safely', async () => {
        const backend = new FakeRedisBackend();
        const app = await createApi(backend);
        backend.failure = new Error(
            'redis://credential@private.example failed',
        );

        const limited = await app.inject({
            method: 'POST',
            url: '/v1/auth/refresh',
        });
        const readiness = await app.inject({ method: 'GET', url: '/readyz' });

        expect(limited.statusCode).toBe(500);
        expect(limited.json()).toMatchObject({ code: 'internal-error' });
        expect(limited.body).not.toContain('private.example');
        expect(readiness.statusCode).toBe(503);
        expect(readiness.json()).toEqual({
            status: 'not-ready',
            checks: {
                'authentication-store': 'ready',
                'preview-store': 'ready',
                'rate-limit-store': 'failed',
            },
        });
        expect(readiness.body).not.toContain('private.example');
    });
});

async function createApi(
    backend: FakeRedisBackend,
): Promise<Awaited<ReturnType<typeof buildApi>>> {
    const rateLimitStore = createRateLimitStoreResource(
        new FakeRedisClient(backend),
    );
    const app = await buildApi({ rateLimitStore, sessionKeyRing });
    openApps.push(app);
    return app;
}

class FakeRedisBackend {
    public failure?: Error;
    public readonly seenKeys: string[] = [];
    readonly #counters = new Map<string, number>();

    public increment(
        key: string,
        timeWindow: number,
    ): readonly [number, number] {
        if (this.failure) {
            throw this.failure;
        }
        this.seenKeys.push(key);
        const current = (this.#counters.get(key) ?? 0) + 1;
        this.#counters.set(key, current);
        return [current, timeWindow];
    }
}

class FakeRedisClient {
    public isOpen = true;
    readonly #backend: FakeRedisBackend;

    public constructor(backend: FakeRedisBackend) {
        this.#backend = backend;
    }

    public eval(
        _script: string,
        options: { readonly arguments: string[]; readonly keys: string[] },
    ): Promise<unknown> {
        return Promise.resolve().then(() => {
            const key = options.keys[0];
            const timeWindow = Number(options.arguments[0]);
            if (!key || !Number.isSafeInteger(timeWindow)) {
                throw new Error('Invalid fake Redis invocation.');
            }
            return this.#backend.increment(key, timeWindow);
        });
    }

    public ping(): Promise<string> {
        return this.#backend.failure
            ? Promise.reject(this.#backend.failure)
            : Promise.resolve('PONG');
    }

    public quit(): Promise<string> {
        this.isOpen = false;
        return Promise.resolve('OK');
    }
}
