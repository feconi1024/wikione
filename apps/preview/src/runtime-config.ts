const developmentEditorOrigins = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
] as const;

export interface PreviewRuntimeConfig {
    readonly editorOrigins: readonly string[];
    readonly host: string;
    readonly port: number;
    readonly redisUrl: string;
    readonly trustProxy: boolean | number;
}

type Environment = Readonly<Record<string, string | undefined>>;

/** Validates the isolated preview service boundary before opening Redis. */
export function readPreviewRuntimeConfig(
    environment: Environment = process.env,
): PreviewRuntimeConfig {
    const production = environment.NODE_ENV?.trim() === 'production';
    const redisUrl =
        environment.REDIS_URL?.trim() ||
        (production ? undefined : 'redis://127.0.0.1:6379');
    if (!redisUrl) {
        throw new Error('Production requires REDIS_URL.');
    }
    assertRedisUrl(redisUrl, production);

    const origins = environment.EDITOR_ORIGINS?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const editorOrigins =
        origins && origins.length > 0
            ? origins
            : production
              ? undefined
              : developmentEditorOrigins;
    if (!editorOrigins || editorOrigins.length === 0) {
        throw new Error('Production requires EDITOR_ORIGINS.');
    }
    if (new Set(editorOrigins).size !== editorOrigins.length) {
        throw new TypeError('EDITOR_ORIGINS must not contain duplicates.');
    }
    for (const origin of editorOrigins) {
        assertOrigin(origin, production);
    }

    const proxyHops = readInteger(
        environment.TRUST_PROXY_HOPS,
        production ? 1 : 0,
        0,
        3,
        'TRUST_PROXY_HOPS',
    );
    if (production && proxyHops === 0) {
        throw new Error('Production requires TRUST_PROXY_HOPS of at least 1.');
    }
    return {
        editorOrigins,
        host:
            environment.PREVIEW_HOST?.trim() ||
            (production ? '0.0.0.0' : '127.0.0.1'),
        port: readInteger(
            environment.PREVIEW_PORT,
            4_174,
            1,
            65_535,
            'PREVIEW_PORT',
        ),
        redisUrl,
        trustProxy: proxyHops === 0 ? false : proxyHops,
    };
}

function assertOrigin(value: string, requireTls: boolean): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError('EDITOR_ORIGINS must contain valid origins.');
    }
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.origin !== value ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    ) {
        throw new TypeError(
            'EDITOR_ORIGINS must contain exact HTTP(S) origins.',
        );
    }
    if (requireTls && url.protocol !== 'https:') {
        throw new Error('Production requires HTTPS EDITOR_ORIGINS.');
    }
}

function assertRedisUrl(value: string, production: boolean): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError('REDIS_URL must be a valid Redis URL.');
    }
    if (!['redis:', 'rediss:'].includes(url.protocol)) {
        throw new TypeError('REDIS_URL must use redis:// or rediss://.');
    }
    if (production && url.protocol !== 'rediss:') {
        throw new Error('Production requires a TLS rediss:// REDIS_URL.');
    }
}

function readInteger(
    value: string | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
    name: string,
): number {
    const parsed = value?.trim() ? Number(value) : fallback;
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new RangeError(
            `${name} must be an integer from ${String(minimum)} to ${String(maximum)}.`,
        );
    }
    return parsed;
}
