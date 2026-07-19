import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildApi } from './app.js';

const artifactPath = fileURLToPath(
    new URL('../../../openapi/wikione.openapi.json', import.meta.url),
);

describe('checked-in OpenAPI artifact', () => {
    it('exactly matches the document emitted by the API', async () => {
        const app = await buildApi();
        try {
            await app.ready();
            const artifact = await readFile(artifactPath, 'utf8');
            expect(JSON.parse(artifact)).toEqual(app.swagger());
        } finally {
            await app.close();
        }
    });
});
