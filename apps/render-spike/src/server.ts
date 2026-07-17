import { resolve } from 'node:path';

import { buildPreviewServer } from './preview-server.js';

const port = readPort(process.env.PREVIEW_PORT, 4_174);
const host = process.env.PREVIEW_HOST?.trim() || '127.0.0.1';
const artifactDirectory = resolve(
    process.cwd(),
    '../../artifacts/render-spike',
);
const app = await buildPreviewServer({ artifactDirectory, logger: true });

try {
    await app.listen({ host, port });
} catch (error: unknown) {
    app.log.error(error);
    process.exitCode = 1;
}

function readPort(value: string | undefined, fallback: number): number {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        throw new RangeError(`Invalid PREVIEW_PORT: ${value}`);
    }
    return parsed;
}
