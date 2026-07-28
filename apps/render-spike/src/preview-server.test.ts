import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildPreviewServer } from './preview-server.js';

const openApps: Awaited<ReturnType<typeof buildPreviewServer>>[] = [];

afterEach(async () => {
    await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('isolated preview server', () => {
    it('serves generated documents with isolation headers', async () => {
        const artifactDirectory = await mkdtemp(
            join(tmpdir(), 'wikione-preview-'),
        );
        await writeFile(
            join(artifactDirectory, 'fixture.html'),
            '<!doctype html><p>Preview</p>',
        );
        await writeFile(
            join(artifactDirectory, 'manifest.json'),
            JSON.stringify({
                generatedAt: '2026-07-17T00:00:00.000Z',
                userAgent: 'WikiOne-Test/0.0',
                results: [
                    {
                        id: 'fixture',
                        label: 'Fixture',
                        supportLevel: 'controlled',
                        wikiBaseUrl: 'https://en.wikipedia.org',
                        apiUrl: 'https://en.wikipedia.org/w/api.php',
                        title: 'Fixture',
                        languageCode: 'en',
                        direction: 'ltr',
                        sourceCharacters: 10,
                        outputFile: 'fixture.html',
                        modules: [],
                        moduleStyles: [],
                        warnings: [],
                        features: {
                            images: 0,
                            figures: 0,
                            tables: 0,
                            mathElements: 0,
                            referenceLists: 0,
                            audioElements: 0,
                            videoElements: 0,
                            interactiveElements: 0,
                        },
                    },
                ],
            }),
        );
        const app = await buildPreviewServer({ artifactDirectory });
        openApps.push(app);

        const response = await app.inject({
            method: 'GET',
            url: '/previews/fixture',
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['content-security-policy']).toContain(
            "default-src 'none'",
        );
        expect(response.headers['content-security-policy']).toContain(
            'frame-ancestors http://localhost:4173',
        );
        expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('does not allow manifest path injection', async () => {
        const artifactDirectory = await mkdtemp(
            join(tmpdir(), 'wikione-preview-'),
        );
        await writeFile(
            join(artifactDirectory, 'manifest.json'),
            JSON.stringify({
                generatedAt: '2026-07-17T00:00:00.000Z',
                userAgent: 'WikiOne-Test/0.0',
                results: [],
            }),
        );
        const app = await buildPreviewServer({ artifactDirectory });
        openApps.push(app);

        const response = await app.inject({
            method: 'GET',
            url: '/previews/..%2Fmanifest',
        });

        expect(response.statusCode).toBe(404);
    });
});
