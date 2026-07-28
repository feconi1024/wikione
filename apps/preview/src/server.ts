import { RedisPreviewStore } from '@wikione/preview-store';
import { createElastiCacheIamCredentialsProvider } from '@wikione/redis-auth';

import { buildPreviewApp } from './app.js';
import { readPreviewRuntimeConfig } from './runtime-config.js';

const config = readPreviewRuntimeConfig();
const redisCredentialsProvider = config.redisIam
    ? createElastiCacheIamCredentialsProvider(config.redisIam)
    : undefined;
const previewStore = await RedisPreviewStore.connect(
    config.redisUrl,
    redisCredentialsProvider,
);
const app = buildPreviewApp({
    editorOrigins: config.editorOrigins,
    logger: true,
    previewStore,
    trustProxy: config.trustProxy,
});

try {
    await app.listen({ host: config.host, port: config.port });
} catch (error: unknown) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
}
