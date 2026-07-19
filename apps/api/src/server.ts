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
import { readApiRuntimeConfig } from './runtime-config.js';

const config = readApiRuntimeConfig();
const redisUrl = config.redisUrl;
const previewStore = await RedisPreviewStore.connect(redisUrl);
const sessionKeyRing = readEnvironmentSessionKeys();
const accounts = await PostgresAccountRepository.connect(config.databaseUrl);
const sessions = await RedisSessionRepository.connect(redisUrl, sessionKeyRing);
const authentication = new AuthenticationService({
    accounts,
    sessions,
    passwordHasher: createPasswordHasher(),
});
const app = await buildApi({
    authentication,
    editorOrigins: config.editorOrigins,
    logger: true,
    ...(process.env.MEDIAWIKI_USER_AGENT
        ? { mediaWikiUserAgent: process.env.MEDIAWIKI_USER_AGENT }
        : {}),
    previewBaseUrl: config.previewBaseUrl,
    previewStore,
    secureCookies: config.secureCookies,
    ...(config.previewTtlMilliseconds === undefined
        ? {}
        : { previewTtlMilliseconds: config.previewTtlMilliseconds }),
    trustProxy: config.trustProxy,
});

try {
    await app.listen({ host: config.host, port: config.port });
} catch (error: unknown) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
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
