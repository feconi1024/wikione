import { describe, expect, it } from 'vitest';

import type { RenderManifest } from './manifest.js';
import { createCompatibilityReport } from './compatibility-report.js';

const manifest: RenderManifest = {
    generatedAt: '2026-07-19T00:00:00.000Z',
    userAgent: 'WikiOne-Test/0.0',
    results: [
        {
            id: 'en-wikipedia',
            label: 'English Wikipedia',
            supportLevel: 'supported',
            wikiBaseUrl: 'https://en.wikipedia.org',
            apiUrl: 'https://en.wikipedia.org/w/api.php',
            title: 'Wikipedia',
            revisionId: 1,
            revisionTimestamp: '2026-07-19T00:00:00.000Z',
            languageCode: 'en',
            direction: 'ltr',
            sourceCharacters: 100,
            outputFile: 'en-wikipedia.html',
            modules: ['z', 'a'],
            moduleStyles: ['style.b'],
            warnings: [{ message: 'Potentially source-derived warning' }],
            features: {
                images: 1,
                figures: 1,
                tables: 1,
                mathElements: 0,
                referenceLists: 1,
                audioElements: 0,
                videoElements: 0,
                interactiveElements: 0,
            },
        },
    ],
};

describe('compatibility report', () => {
    it('records a deterministic source-free gate summary', () => {
        const report = createCompatibilityReport(manifest, []);

        expect(report).toMatchObject({
            schemaVersion: 1,
            mode: 'anonymous-read-only',
            passed: true,
            summary: {
                fixtures: 1,
                failures: 0,
                supportedTargets: ['en-wikipedia'],
            },
        });
        expect(report.fixtures[0]).toMatchObject({
            modules: ['a', 'z'],
            warningCount: 1,
            passed: true,
        });
        expect(JSON.stringify(report)).not.toContain(
            'Potentially source-derived warning',
        );
    });

    it('maps validation failures to their fixture', () => {
        const report = createCompatibilityReport(manifest, [
            { fixtureId: 'en-wikipedia', message: 'Missing image.' },
        ]);

        expect(report.passed).toBe(false);
        expect(report.fixtures[0]).toMatchObject({
            passed: false,
            failures: ['Missing image.'],
        });
    });
});
