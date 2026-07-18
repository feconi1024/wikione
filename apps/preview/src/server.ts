import { RedisPreviewStore } from '@wikione/preview-store';

import { buildPreviewApp } from './app.js';

const port = readPort(process.env.PREVIEW_PORT, 4_174);
const host = process.env.PREVIEW_HOST?.trim() || '127.0.0.1';
const redisUrl = process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
const editorOrigins = readOrigins(process.env.EDITOR_ORIGINS);
const previewStore = await RedisPreviewStore.connect(redisUrl);
const app = buildPreviewApp({
    ...(editorOrigins ? { editorOrigins } : {}),
    logger: true,
    previewStore,
});

try {
    await app.listen({ host, port });
} catch (error: unknown) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
}

function readPort(value: string | undefined, fallback: number): number {
    if (value === undefined || !value.trim()) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
        throw new RangeError(`Invalid PREVIEW_PORT: ${value}`);
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
