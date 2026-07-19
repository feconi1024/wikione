import { randomBytes } from 'node:crypto';

import {
    AuthenticationService,
    createPasswordHasher,
    readSessionKeyRing,
} from '@wikione/auth-core';
import {
    PostgresAccountRepository,
    RedisSessionRepository,
} from '@wikione/auth-store';
import { RedisPreviewStore } from '@wikione/preview-store';

import { buildApi } from './app.js';

const port = readPort(process.env.API_PORT, 3_000);
const host = process.env.API_HOST?.trim() || '127.0.0.1';
const redisUrl = process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
const databaseUrl =
    process.env.DATABASE_URL?.trim() ||
    'postgres://wikione:wikione@127.0.0.1:5432/wikione';
const editorOrigins = readOrigins(process.env.EDITOR_ORIGINS);
const previewTtlMilliseconds = readOptionalInteger(
    process.env.PREVIEW_TTL_MILLISECONDS,
);
const previewStore = await RedisPreviewStore.connect(redisUrl);
const sessionKeyRing = readEnvironmentSessionKeys();
const accounts = await PostgresAccountRepository.connect(databaseUrl);
const sessions = await RedisSessionRepository.connect(redisUrl, sessionKeyRing);
const authentication = new AuthenticationService({
    accounts,
    sessions,
    passwordHasher: createPasswordHasher(),
});
const app = await buildApi({
    authentication,
    ...(editorOrigins ? { editorOrigins } : {}),
    logger: true,
    ...(process.env.MEDIAWIKI_USER_AGENT
        ? { mediaWikiUserAgent: process.env.MEDIAWIKI_USER_AGENT }
        : {}),
    ...(process.env.PREVIEW_BASE_URL
        ? { previewBaseUrl: process.env.PREVIEW_BASE_URL }
        : {}),
    previewStore,
    secureCookies: readBoolean(
        process.env.COOKIE_SECURE,
        process.env.NODE_ENV === 'production',
    ),
    ...(previewTtlMilliseconds === undefined ? {} : { previewTtlMilliseconds }),
});

try {
    await app.listen({ host, port });
} catch (error: unknown) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
}

function readPort(value: string | undefined, fallback: number): number {
    const parsed = readOptionalInteger(value) ?? fallback;
    if (parsed < 1 || parsed > 65_535) {
        throw new RangeError(`Invalid API_PORT: ${String(value)}`);
    }
    return parsed;
}

function readOptionalInteger(value: string | undefined): number | undefined {
    if (value === undefined || !value.trim()) {
        return undefined;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new RangeError(`Expected an integer, received: ${value}`);
    }
    return parsed;
}

function readOrigins(value: string | undefined): readonly string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const origins = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    return origins.length > 0 ? origins : undefined;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || !value.trim()) {
        return fallback;
    }
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    throw new TypeError(`Expected true or false, received: ${value}`);
}

function readEnvironmentSessionKeys() {
    const encryptionKey = process.env.SESSION_ENCRYPTION_KEY_BASE64?.trim();
    const lookupKey = process.env.SESSION_LOOKUP_HMAC_KEY_BASE64?.trim();
    if (encryptionKey && lookupKey) {
        return readSessionKeyRing({
            activeKeyId: process.env.SESSION_KEY_ID?.trim() || 'primary',
            encryptionKeyBase64: encryptionKey,
            lookupHmacKeyBase64: lookupKey,
        });
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            'Production requires SESSION_ENCRYPTION_KEY_BASE64 and SESSION_LOOKUP_HMAC_KEY_BASE64.',
        );
    }
    return readSessionKeyRing({
        activeKeyId: 'ephemeral-development',
        encryptionKeyBase64: randomBytes(32).toString('base64'),
        lookupHmacKeyBase64: randomBytes(32).toString('base64'),
    });
}
