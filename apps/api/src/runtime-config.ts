const developmentEditorOrigins = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
] as const;

export interface ApiRuntimeConfig {
    readonly databaseUrl: string;
    readonly editorOrigins: readonly string[];
    readonly host: string;
    readonly port: number;
    readonly previewBaseUrl: string;
    readonly previewTtlMilliseconds?: number;
    readonly redisUrl: string;
    readonly redisIam?: RedisIamRuntimeConfig;
    readonly secureCookies: boolean;
    readonly trustProxy: boolean | number;
}

export interface RedisIamRuntimeConfig {
    readonly cacheName: string;
    readonly region: string;
    readonly userId: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Parses startup configuration before any network client is created. Production
 * refuses local fallbacks and transport settings that would weaken the public
 * beta boundary.
 */
export function readApiRuntimeConfig(
    environment: Environment = process.env,
): ApiRuntimeConfig {
    const production = environment.NODE_ENV?.trim() === 'production';
    const redisUrl = readValue(
        environment.REDIS_URL,
        production ? undefined : 'redis://127.0.0.1:6379',
        'REDIS_URL',
    );
    const databaseUrl = readDatabaseUrl(environment, production);
    const previewBaseUrl = readValue(
        environment.PREVIEW_BASE_URL,
        production ? undefined : 'http://127.0.0.1:4174',
        'PREVIEW_BASE_URL',
    );
    const editorOrigins = readOrigins(
        environment.EDITOR_ORIGINS,
        production ? undefined : developmentEditorOrigins,
    );
    const secureCookies = readBoolean(
        environment.COOKIE_SECURE,
        production,
        'COOKIE_SECURE',
    );
    const proxyHops = readInteger(
        environment.TRUST_PROXY_HOPS,
        production ? 1 : 0,
        0,
        3,
        'TRUST_PROXY_HOPS',
    );
    const redisIam = readRedisIamConfig(environment, production);

    assertRedisUrl(redisUrl, production);
    assertDatabaseUrl(databaseUrl, production);
    assertOrigin(previewBaseUrl, 'PREVIEW_BASE_URL', production);
    for (const origin of editorOrigins) {
        assertOrigin(origin, 'EDITOR_ORIGINS', production);
    }
    if (production && !secureCookies) {
        throw new Error('Production requires COOKIE_SECURE=true.');
    }
    if (production && proxyHops === 0) {
        throw new Error('Production requires TRUST_PROXY_HOPS of at least 1.');
    }

    const previewTtlMilliseconds = readOptionalInteger(
        environment.PREVIEW_TTL_MILLISECONDS,
        1_000,
        600_000,
        'PREVIEW_TTL_MILLISECONDS',
    );
    return {
        databaseUrl,
        editorOrigins,
        host:
            environment.API_HOST?.trim() ||
            (production ? '0.0.0.0' : '127.0.0.1'),
        port: readInteger(environment.API_PORT, 3_000, 1, 65_535, 'API_PORT'),
        previewBaseUrl,
        ...(previewTtlMilliseconds === undefined
            ? {}
            : { previewTtlMilliseconds }),
        redisUrl,
        ...(redisIam ? { redisIam } : {}),
        secureCookies,
        trustProxy: proxyHops === 0 ? false : proxyHops,
    };
}

function readDatabaseUrl(
    environment: Environment,
    production: boolean,
): string {
    const explicitUrl = environment.DATABASE_URL?.trim();
    const components = {
        host: environment.DATABASE_HOST?.trim(),
        name: environment.DATABASE_NAME?.trim(),
        password: environment.DATABASE_PASSWORD,
        port: environment.DATABASE_PORT?.trim(),
        user: environment.DATABASE_USER?.trim(),
    };
    const presentComponents = Object.values(components).filter(
        (value) => value !== undefined && value !== '',
    ).length;
    if (explicitUrl && presentComponents > 0) {
        throw new Error(
            'Configure DATABASE_URL or the DATABASE_HOST/PORT/NAME/USER/PASSWORD set, not both.',
        );
    }
    if (explicitUrl) {
        return explicitUrl;
    }
    if (presentComponents === 0 && !production) {
        return 'postgres://wikione:wikione@127.0.0.1:5432/wikione';
    }
    if (presentComponents !== 5) {
        throw new Error(
            'Production database components require DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, and DATABASE_PASSWORD together.',
        );
    }

    const url = new URL('postgresql://database.invalid');
    url.hostname = components.host as string;
    url.port = String(
        readInteger(components.port, 5_432, 1, 65_535, 'DATABASE_PORT'),
    );
    url.username = components.user as string;
    url.password = components.password as string;
    url.pathname = `/${components.name as string}`;
    url.searchParams.set('sslmode', 'verify-full');
    return url.toString();
}

function readRedisIamConfig(
    environment: Environment,
    required: boolean,
): RedisIamRuntimeConfig | undefined {
    const values = {
        cacheName: environment.REDIS_IAM_CACHE_NAME?.trim(),
        region: environment.AWS_REGION?.trim(),
        userId: environment.REDIS_IAM_USER_ID?.trim(),
    };
    const present = Object.values(values).filter(Boolean).length;
    if (present === 0 && !required) {
        return undefined;
    }
    if (present !== 3) {
        throw new Error(
            'ElastiCache IAM requires REDIS_IAM_CACHE_NAME, REDIS_IAM_USER_ID, and AWS_REGION together.',
        );
    }
    return values as RedisIamRuntimeConfig;
}

function readValue(
    value: string | undefined,
    fallback: string | undefined,
    name: string,
): string {
    const normalized = value?.trim() || fallback;
    if (!normalized) {
        throw new Error(`Production requires ${name}.`);
    }
    return normalized;
}

function readOrigins(
    value: string | undefined,
    fallback: readonly string[] | undefined,
): readonly string[] {
    const origins = value
        ?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const normalized = origins && origins.length > 0 ? origins : fallback;
    if (!normalized || normalized.length === 0) {
        throw new Error('Production requires EDITOR_ORIGINS.');
    }
    if (new Set(normalized).size !== normalized.length) {
        throw new TypeError('EDITOR_ORIGINS must not contain duplicates.');
    }
    return normalized;
}

function assertOrigin(value: string, name: string, requireTls: boolean): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError(`${name} must contain valid origins.`);
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
        throw new TypeError(`${name} must contain exact HTTP(S) origins.`);
    }
    if (requireTls && url.protocol !== 'https:') {
        throw new Error(`Production requires HTTPS ${name}.`);
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

function assertDatabaseUrl(value: string, production: boolean): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError('DATABASE_URL must be a valid PostgreSQL URL.');
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
        throw new TypeError(
            'DATABASE_URL must use postgres:// or postgresql://.',
        );
    }
    if (
        production &&
        !['require', 'verify-ca', 'verify-full'].includes(
            url.searchParams.get('sslmode') ?? '',
        )
    ) {
        throw new Error(
            'Production DATABASE_URL requires sslmode=require, verify-ca, or verify-full.',
        );
    }
}

function readBoolean(
    value: string | undefined,
    fallback: boolean,
    name: string,
): boolean {
    if (value === undefined || !value.trim()) {
        return fallback;
    }
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    throw new TypeError(`${name} must be true or false.`);
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

function readOptionalInteger(
    value: string | undefined,
    minimum: number,
    maximum: number,
    name: string,
): number | undefined {
    if (value === undefined || !value.trim()) {
        return undefined;
    }
    return readInteger(value, minimum, minimum, maximum, name);
}
