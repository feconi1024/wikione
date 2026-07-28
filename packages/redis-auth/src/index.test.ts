import { describe, expect, it, vi } from 'vitest';

import {
    createElastiCacheIamCredentialsProvider,
    createElastiCacheIamToken,
} from './index.js';

const config = {
    cacheName: 'wikione-production-redis',
    region: 'ap-southeast-1',
    userId: 'wikione-production-api',
} as const;

describe('ElastiCache IAM credentials', () => {
    it('presigns the bounded connect request without a URL scheme', async () => {
        const token = await createElastiCacheIamToken(config, {
            credentials: {
                accessKeyId: 'AKIDEXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
                sessionToken: 'session-token',
            },
            signingDate: new Date('2026-07-19T00:00:00.000Z'),
        });

        expect(token).not.toMatch(/^https?:\/\//u);
        expect(token).toContain('Action=connect');
        expect(token).toContain('User=wikione-production-api');
        expect(token).toContain('X-Amz-Expires=900');
        expect(token).toContain('X-Amz-Security-Token=session-token');
        expect(token).toContain('X-Amz-Signature=');
    });

    it('requests a fresh token for every credential refresh', async () => {
        vi.useFakeTimers();
        const tokenFactory = vi
            .fn()
            .mockResolvedValueOnce('token-one')
            .mockResolvedValueOnce('token-two');
        const provider = createElastiCacheIamCredentialsProvider(config, {
            credentialLifetimeMilliseconds: 1_000,
            expirySafetyMilliseconds: 10,
            refreshIntervalMilliseconds: 100,
            retryIntervalMilliseconds: 10,
            tokenFactory,
        });
        const listener = {
            onError: vi.fn(),
            onNext: vi.fn(),
        };

        const [initial, subscription] = await provider.subscribe(listener);
        expect(initial).toEqual({
            username: config.userId,
            password: 'token-one',
        });
        await vi.advanceTimersByTimeAsync(100);
        expect(listener.onNext).toHaveBeenCalledWith({
            username: config.userId,
            password: 'token-two',
        });
        expect(tokenFactory).toHaveBeenCalledTimes(2);
        expect(listener.onError).not.toHaveBeenCalled();

        subscription.dispose();
        await vi.advanceTimersByTimeAsync(200);
        expect(tokenFactory).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });

    it('retries transient signing failures before the current token expires', async () => {
        vi.useFakeTimers();
        const tokenFactory = vi
            .fn()
            .mockResolvedValueOnce('token-one')
            .mockRejectedValueOnce(new Error('temporary credentials failure'))
            .mockResolvedValueOnce('token-two');
        const provider = createElastiCacheIamCredentialsProvider(config, {
            credentialLifetimeMilliseconds: 1_000,
            expirySafetyMilliseconds: 10,
            refreshIntervalMilliseconds: 100,
            retryIntervalMilliseconds: 20,
            tokenFactory,
        });
        const listener = {
            onError: vi.fn(),
            onNext: vi.fn(),
        };

        const [, subscription] = await provider.subscribe(listener);
        await vi.advanceTimersByTimeAsync(100);
        expect(listener.onNext).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(20);
        expect(listener.onNext).toHaveBeenCalledWith({
            username: config.userId,
            password: 'token-two',
        });
        expect(listener.onError).not.toHaveBeenCalled();

        subscription.dispose();
        vi.useRealTimers();
    });

    it('reports a fatal refresh error before using an expired token', async () => {
        vi.useFakeTimers();
        const tokenFactory = vi
            .fn()
            .mockResolvedValueOnce('token-one')
            .mockRejectedValue(new Error('credentials unavailable'));
        const provider = createElastiCacheIamCredentialsProvider(config, {
            credentialLifetimeMilliseconds: 160,
            expirySafetyMilliseconds: 20,
            refreshIntervalMilliseconds: 100,
            retryIntervalMilliseconds: 30,
            tokenFactory,
        });
        const listener = {
            onError: vi.fn(),
            onNext: vi.fn(),
        };

        await provider.subscribe(listener);
        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(30);
        expect(listener.onError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'credentials unavailable' }),
        );
        expect(listener.onNext).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it.each([
        [{ ...config, cacheName: 'UPPERCASE' }],
        [{ ...config, userId: 'unsafe/user' }],
        [{ ...config, region: 'local' }],
    ])('rejects unsafe signing identifiers', (value) => {
        expect(() => createElastiCacheIamCredentialsProvider(value)).toThrow();
    });
});
