import { describe, expect, it } from 'vitest';

import { readApiRuntimeConfig } from './runtime-config.js';

const productionEnvironment = {
    NODE_ENV: 'production',
    COOKIE_SECURE: 'true',
    DATABASE_URL:
        'postgres://wikione:secret@database.internal:5432/wikione?sslmode=verify-full',
    EDITOR_ORIGINS: 'https://app.wikione.example',
    PREVIEW_BASE_URL: 'https://preview.wikione.example',
    REDIS_URL: 'rediss://cache.internal:6379',
    TRUST_PROXY_HOPS: '1',
} as const;

describe('API runtime configuration', () => {
    it('keeps explicit development-only local defaults', () => {
        expect(readApiRuntimeConfig({})).toMatchObject({
            host: '127.0.0.1',
            port: 3_000,
            secureCookies: false,
            trustProxy: false,
        });
    });

    it('accepts an exact TLS production boundary', () => {
        expect(readApiRuntimeConfig(productionEnvironment)).toEqual({
            databaseUrl: productionEnvironment.DATABASE_URL,
            editorOrigins: ['https://app.wikione.example'],
            host: '0.0.0.0',
            port: 3_000,
            previewBaseUrl: 'https://preview.wikione.example',
            redisUrl: 'rediss://cache.internal:6379',
            secureCookies: true,
            trustProxy: 1,
        });
    });

    it.each([
        [{ ...productionEnvironment, REDIS_URL: 'redis://cache:6379' }],
        [
            {
                ...productionEnvironment,
                DATABASE_URL: 'postgres://wikione:secret@database:5432/wikione',
            },
        ],
        [
            {
                ...productionEnvironment,
                EDITOR_ORIGINS: 'http://app.wikione.example',
            },
        ],
        [
            {
                ...productionEnvironment,
                PREVIEW_BASE_URL: 'http://preview.wikione.example',
            },
        ],
        [{ ...productionEnvironment, COOKIE_SECURE: 'false' }],
        [{ ...productionEnvironment, TRUST_PROXY_HOPS: '0' }],
    ])('rejects an insecure production boundary', (environment) => {
        expect(() => readApiRuntimeConfig(environment)).toThrow();
    });

    it('does not include a secret URL in a validation error', () => {
        const secret = 'not-a-url-with-a-password';
        let thrown: unknown;
        try {
            readApiRuntimeConfig({
                ...productionEnvironment,
                DATABASE_URL: secret,
            });
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).not.toContain(secret);
    });
});
