import { createHash } from 'node:crypto';

import type {
    FastifyRateLimitOptions,
    FastifyRateLimitStore,
    FastifyRateLimitStoreCtor,
} from '@fastify/rate-limit';
import { createClient } from 'redis';

import type { RedisCredentialsProvider } from '@wikione/redis-auth';

const keyPrefix = 'wikione:rate-limit:';
const rateLimitScript = `
    local current = redis.call('INCR', KEYS[1])
    local timeWindow = tonumber(ARGV[1])
    local max = tonumber(ARGV[2])
    local continueExceeding = ARGV[3] == 'true'
    local exponentialBackoff = ARGV[4] == 'true'
    local maxSafeInteger = (2^53) - 1

    if current == 1 or (continueExceeding and current > max) then
        redis.call('PEXPIRE', KEYS[1], timeWindow)
    elseif exponentialBackoff and current > max then
        local exponent = current - max - 1
        timeWindow = math.min(timeWindow * (2 ^ exponent), maxSafeInteger)
        redis.call('PEXPIRE', KEYS[1], timeWindow)
    else
        timeWindow = redis.call('PTTL', KEYS[1])
        if timeWindow < 0 then
            redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
            timeWindow = tonumber(ARGV[1])
        end
    end

    return {current, timeWindow}
`;

interface RedisRateLimitClient {
    readonly isOpen: boolean;
    readonly eval: (
        script: string,
        options: {
            readonly arguments: string[];
            readonly keys: string[];
        },
    ) => Promise<unknown>;
    readonly ping: () => Promise<string>;
    readonly quit: () => Promise<unknown>;
}

interface StoreRuntimeOptions extends FastifyRateLimitOptions {
    readonly continueExceeding?: boolean;
    readonly exponentialBackoff?: boolean;
    readonly groupId?: string;
    readonly routeInfo?: {
        readonly method?: string | readonly string[];
        readonly url?: string;
    };
}

export interface RateLimitStoreResource {
    readonly store: FastifyRateLimitStoreCtor;
    readonly close: () => Promise<void>;
    readonly ready: () => Promise<void>;
}

/** Connects the shared API rate-limit counter without persisting IAM tokens. */
export async function connectRedisRateLimitStore(
    url: string,
    credentialsProvider?: RedisCredentialsProvider,
): Promise<RateLimitStoreResource> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
        throw new TypeError('REDIS_URL must use redis:// or rediss://.');
    }
    const client = createClient({
        url,
        ...(credentialsProvider ? { credentialsProvider } : {}),
    });
    client.on('error', () => {
        // Readiness and safe request failures report availability without keys or addresses.
    });
    await client.connect();
    return createRateLimitStoreResource(client);
}

/** Test seam and adapter from node-redis to Fastify's custom-store contract. */
export function createRateLimitStoreResource(
    client: RedisRateLimitClient,
): RateLimitStoreResource {
    class RedisRateLimitStore implements FastifyRateLimitStore {
        readonly #continueExceeding: boolean;
        readonly #exponentialBackoff: boolean;
        readonly #scope: string;

        public constructor(options: FastifyRateLimitOptions, scope = 'global') {
            const runtimeOptions = options as StoreRuntimeOptions;
            this.#continueExceeding = runtimeOptions.continueExceeding ?? false;
            this.#exponentialBackoff =
                runtimeOptions.exponentialBackoff ?? false;
            this.#scope = scope;
        }

        public incr(
            key: string,
            callback: (
                error: Error | null,
                result?: { readonly current: number; readonly ttl: number },
            ) => void,
            timeWindow = 60_000,
            max = 1_000,
        ): void {
            void this.#increment(key, timeWindow, max).then(
                (result) => callback(null, result),
                (cause: unknown) => callback(toError(cause)),
            );
        }

        public child(
            options: Parameters<FastifyRateLimitStore['child']>[0],
        ): FastifyRateLimitStore {
            const runtimeOptions = options as unknown as StoreRuntimeOptions;
            return new RedisRateLimitStore(
                runtimeOptions,
                readScope(runtimeOptions),
            );
        }

        async #increment(
            key: string,
            timeWindow: number,
            max: number,
        ): Promise<{ readonly current: number; readonly ttl: number }> {
            assertCounterInput(key, timeWindow, max);
            const result = await client.eval(rateLimitScript, {
                keys: [`${keyPrefix}${this.#scope}:${key}`],
                arguments: [
                    String(timeWindow),
                    String(max),
                    String(this.#continueExceeding),
                    String(this.#exponentialBackoff),
                ],
            });
            return parseCounterResult(result);
        }
    }

    return {
        store: RedisRateLimitStore,
        ready: async () => {
            if ((await client.ping()) !== 'PONG') {
                throw new Error('Redis rate-limit readiness check failed.');
            }
        },
        close: async () => {
            if (client.isOpen) {
                await client.quit();
            }
        },
    };
}

function readScope(options: StoreRuntimeOptions): string {
    const method = options.routeInfo?.method ?? 'manual';
    const route = options.routeInfo?.url ?? options.groupId ?? 'limiter';
    const methodName = typeof method === 'string' ? method : method.join(',');
    const identity = `${methodName}:${route}`;
    return createHash('sha256').update(identity).digest('hex').slice(0, 24);
}

function assertCounterInput(
    key: string,
    timeWindow: number,
    max: number,
): void {
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(key)) {
        throw new TypeError('Rate-limit keys must be opaque and bounded.');
    }
    if (!Number.isSafeInteger(timeWindow) || timeWindow < 1) {
        throw new TypeError(
            'Rate-limit timeWindow must be a positive integer.',
        );
    }
    if (!Number.isSafeInteger(max) || max < 0) {
        throw new TypeError('Rate-limit max must be a non-negative integer.');
    }
}

function parseCounterResult(value: unknown): {
    readonly current: number;
    readonly ttl: number;
} {
    if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        !value.every(
            (part) =>
                typeof part === 'number' &&
                Number.isSafeInteger(part) &&
                part >= 0,
        )
    ) {
        throw new Error('Redis returned an invalid rate-limit counter.');
    }
    return { current: value[0] as number, ttl: value[1] as number };
}

function toError(cause: unknown): Error {
    return cause instanceof Error
        ? cause
        : new Error('Redis rate-limit operation failed.');
}
