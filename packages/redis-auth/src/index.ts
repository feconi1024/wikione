import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { formatUrl } from '@aws-sdk/util-format-url';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';

const tokenLifetimeSeconds = 900;
const tokenLifetimeMilliseconds = tokenLifetimeSeconds * 1_000;
const defaultRefreshIntervalMilliseconds = 10 * 60 * 1_000;
const defaultRetryIntervalMilliseconds = 15_000;
const defaultExpirySafetyMilliseconds = 30_000;

export interface RedisBasicAuth {
    readonly password?: string;
    readonly username?: string;
}

export interface RedisCredentialsListener {
    readonly onError: (error: Error) => void;
    readonly onNext: (credentials: RedisBasicAuth) => void;
}

export interface RedisCredentialsSubscription {
    readonly dispose: () => void;
}

/** Structural match for node-redis' streaming credentials-provider interface. */
export interface RedisCredentialsProvider {
    readonly type: 'streaming-credentials-provider';
    readonly onReAuthenticationError: (error: Error) => void;
    readonly subscribe: (
        listener: RedisCredentialsListener,
    ) => Promise<[RedisBasicAuth, RedisCredentialsSubscription]>;
}

export interface ElastiCacheIamConfig {
    readonly cacheName: string;
    readonly region: string;
    readonly userId: string;
}

interface AwsCredentials {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken?: string;
}

interface TokenOptions {
    readonly credentials?: AwsCredentials;
    readonly signingDate?: Date;
}

export interface ElastiCacheIamProviderOptions {
    /** Receives a sanitized node-redis reauthentication failure. */
    readonly onReAuthenticationError?: (error: Error) => void;
    /** Test seam; production uses the 15-minute IAM credential lifetime. */
    readonly credentialLifetimeMilliseconds?: number;
    /** Test seam; production renews credentials five minutes before expiry. */
    readonly refreshIntervalMilliseconds?: number;
    /** Test seam; production retries transient signing failures every 15 seconds. */
    readonly retryIntervalMilliseconds?: number;
    /** Test seam; production stops retrying 30 seconds before expiry. */
    readonly expirySafetyMilliseconds?: number;
    /** Test seam for deterministic signing and failure coverage. */
    readonly tokenFactory?: (value: ElastiCacheIamConfig) => Promise<string>;
}

/**
 * Creates a provider that renews SigV4 credentials before expiry and lets
 * node-redis reauthenticate the existing connection. Transient signing errors
 * are retried while the current credential remains valid. No AWS credential or
 * generated token is retained beyond the active connection or emitted to logs.
 */
export function createElastiCacheIamCredentialsProvider(
    config: ElastiCacheIamConfig,
    options: ElastiCacheIamProviderOptions = {},
): RedisCredentialsProvider {
    assertConfig(config);
    const credentialLifetime =
        options.credentialLifetimeMilliseconds ?? tokenLifetimeMilliseconds;
    const refreshInterval =
        options.refreshIntervalMilliseconds ??
        defaultRefreshIntervalMilliseconds;
    const retryInterval =
        options.retryIntervalMilliseconds ?? defaultRetryIntervalMilliseconds;
    const expirySafety =
        options.expirySafetyMilliseconds ?? defaultExpirySafetyMilliseconds;
    const tokenFactory = options.tokenFactory ?? createElastiCacheIamToken;
    assertProviderTiming({
        credentialLifetime,
        expirySafety,
        refreshInterval,
        retryInterval,
    });

    return {
        type: 'streaming-credentials-provider',
        onReAuthenticationError: (error) => {
            options.onReAuthenticationError?.(error);
        },
        subscribe: async (listener) => {
            let disposed = false;
            let expiresAt = Date.now() + credentialLifetime;
            let timer: ReturnType<typeof setTimeout> | undefined;

            const credentials = async (): Promise<RedisBasicAuth> => ({
                username: config.userId,
                password: await tokenFactory(config),
            });
            const schedule = (delay: number, callback: () => void): void => {
                timer = setTimeout(callback, delay);
                timer.unref?.();
            };
            const refresh = async (): Promise<void> => {
                try {
                    const next = await credentials();
                    if (disposed) {
                        return;
                    }
                    expiresAt = Date.now() + credentialLifetime;
                    listener.onNext(next);
                    schedule(refreshInterval, () => void refresh());
                } catch (cause) {
                    if (disposed) {
                        return;
                    }
                    if (Date.now() + retryInterval < expiresAt - expirySafety) {
                        schedule(retryInterval, () => void refresh());
                        return;
                    }
                    disposed = true;
                    listener.onError(toError(cause));
                }
            };

            const initial = await credentials();
            schedule(refreshInterval, () => void refresh());
            return [
                initial,
                {
                    dispose: () => {
                        disposed = true;
                        if (timer) {
                            clearTimeout(timer);
                        }
                    },
                },
            ];
        },
    };
}

/** Generates the short-lived password accepted by ElastiCache IAM auth. */
export async function createElastiCacheIamToken(
    config: ElastiCacheIamConfig,
    options: TokenOptions = {},
): Promise<string> {
    assertConfig(config);
    const credentials = options.credentials ?? defaultProvider();
    const signer = new SignatureV4({
        credentials,
        region: config.region,
        service: 'elasticache',
        sha256: Sha256,
    });
    const request = new HttpRequest({
        hostname: config.cacheName,
        method: 'GET',
        protocol: 'http:',
        query: {
            Action: 'connect',
            User: config.userId,
        },
    });
    const signed = await signer.presign(request, {
        expiresIn: tokenLifetimeSeconds,
        ...(options.signingDate ? { signingDate: options.signingDate } : {}),
    });
    return formatUrl(signed).replace(/^https?:\/\//u, '');
}

function assertConfig(config: ElastiCacheIamConfig): void {
    if (!/^[a-z0-9][a-z0-9-]{0,49}$/u.test(config.cacheName)) {
        throw new TypeError(
            'ElastiCache cacheName must be lowercase and DNS-safe.',
        );
    }
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(config.userId)) {
        throw new TypeError(
            'ElastiCache userId must be lowercase and DNS-safe.',
        );
    }
    if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u.test(config.region)) {
        throw new TypeError(
            'ElastiCache region must be an AWS region identifier.',
        );
    }
}

function assertProviderTiming(values: {
    readonly credentialLifetime: number;
    readonly expirySafety: number;
    readonly refreshInterval: number;
    readonly retryInterval: number;
}): void {
    for (const [name, value] of Object.entries(values)) {
        if (!Number.isSafeInteger(value) || value < 0) {
            throw new TypeError(`${name} must be a non-negative integer.`);
        }
    }
    if (values.retryInterval === 0) {
        throw new TypeError('retryInterval must be greater than zero.');
    }
    if (
        values.refreshInterval >=
        values.credentialLifetime - values.expirySafety
    ) {
        throw new TypeError(
            'refreshInterval must leave time to renew the current credential.',
        );
    }
}

function toError(cause: unknown): Error {
    return cause instanceof Error
        ? cause
        : new Error('Unable to refresh ElastiCache IAM credentials.');
}
