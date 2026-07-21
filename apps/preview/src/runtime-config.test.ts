import { describe, expect, it } from 'vitest';

import { readPreviewRuntimeConfig } from './runtime-config.js';

const productionEnvironment = {
    NODE_ENV: 'production',
    EDITOR_ORIGINS: 'https://app.wikione.example',
    REDIS_URL: 'rediss://cache.internal:6379',
    REDIS_IAM_CACHE_NAME: 'wikione-production-redis',
    REDIS_IAM_USER_ID: 'wikione-production-preview',
    AWS_REGION: 'ap-southeast-1',
    TRUST_PROXY_HOPS: '1',
} as const;

describe('preview runtime configuration', () => {
    it('keeps explicit development-only local defaults', () => {
        expect(readPreviewRuntimeConfig({})).toMatchObject({
            host: '127.0.0.1',
            port: 4_174,
            trustProxy: false,
        });
    });

    it('accepts an exact TLS production boundary', () => {
        expect(readPreviewRuntimeConfig(productionEnvironment)).toEqual({
            editorOrigins: ['https://app.wikione.example'],
            host: '0.0.0.0',
            port: 4_174,
            redisUrl: 'rediss://cache.internal:6379',
            redisIam: {
                cacheName: 'wikione-production-redis',
                region: 'ap-southeast-1',
                userId: 'wikione-production-preview',
            },
            trustProxy: 1,
        });
    });

    it.each([
        [{ ...productionEnvironment, REDIS_URL: 'redis://cache:6379' }],
        [
            {
                ...productionEnvironment,
                EDITOR_ORIGINS: 'http://app.wikione.example',
            },
        ],
        [{ ...productionEnvironment, TRUST_PROXY_HOPS: '0' }],
        [{ ...productionEnvironment, EDITOR_ORIGINS: '' }],
        [{ ...productionEnvironment, REDIS_IAM_CACHE_NAME: '' }],
    ])('rejects an insecure production boundary', (environment) => {
        expect(() => readPreviewRuntimeConfig(environment)).toThrow();
    });
});
