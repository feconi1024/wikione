import { describe, expect, it } from 'vitest';

import type { RenderFixture } from './config.js';
import type { RenderManifest } from './manifest.js';
import { validateManifest } from './validation.js';

const fixture: RenderFixture = {
    id: 'media',
    label: 'Media',
    supportLevel: 'controlled',
    wikiBaseUrl: 'https://en.wikipedia.org',
    apiUrl: 'https://en.wikipedia.org/w/api.php',
    title: 'Sandbox',
    sourceFile: 'media.mediawiki',
    expected: {
        direction: 'ltr',
        minimumSourceCharacters: 10,
        minimumImages: 1,
        minimumTables: 1,
    },
};

describe('live fidelity validation', () => {
    it('reports precise missing-feature failures', () => {
        const manifest: RenderManifest = {
            generatedAt: '2026-07-17T00:00:00.000Z',
            userAgent: 'WikiOne-Test/0.0',
            results: [
                {
                    id: 'media',
                    label: 'Media',
                    supportLevel: 'controlled',
                    wikiBaseUrl: fixture.wikiBaseUrl,
                    apiUrl: fixture.apiUrl,
                    title: fixture.title,
                    languageCode: 'en',
                    direction: 'ltr',
                    sourceCharacters: 100,
                    outputFile: 'media.html',
                    modules: [],
                    moduleStyles: [],
                    warnings: [],
                    features: {
                        images: 0,
                        figures: 0,
                        tables: 1,
                        mathElements: 0,
                        referenceLists: 0,
                        audioElements: 0,
                        videoElements: 0,
                        interactiveElements: 0,
                    },
                },
            ],
        };

        expect(validateManifest(manifest, [fixture])).toEqual([
            {
                fixtureId: 'media',
                message: 'Expected at least 1 images; found 0.',
            },
        ]);
    });
});
