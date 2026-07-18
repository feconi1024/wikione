import { RedisPreviewStore } from '@wikione/preview-store';

import { buildApi } from './app.js';

const port = readPort(process.env.API_PORT, 3_000);
const host = process.env.API_HOST?.trim() || '127.0.0.1';
const redisUrl = process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
const editorOrigins = readOrigins(process.env.EDITOR_ORIGINS);
const previewTtlMilliseconds = readOptionalInteger(
    process.env.PREVIEW_TTL_MILLISECONDS,
);
const previewStore = await RedisPreviewStore.connect(redisUrl);
const app = await buildApi({
    ...(editorOrigins ? { editorOrigins } : {}),
    logger: true,
    ...(process.env.MEDIAWIKI_USER_AGENT
        ? { mediaWikiUserAgent: process.env.MEDIAWIKI_USER_AGENT }
        : {}),
    ...(process.env.PREVIEW_BASE_URL
        ? { previewBaseUrl: process.env.PREVIEW_BASE_URL }
        : {}),
    previewStore,
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
