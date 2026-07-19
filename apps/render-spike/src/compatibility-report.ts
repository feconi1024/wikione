import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { RenderManifest } from './manifest.js';
import type { ValidationFailure } from './validation.js';

export interface CompatibilityReport {
    readonly schemaVersion: 1;
    readonly generatedAt: string;
    readonly mode: 'anonymous-read-only';
    readonly passed: boolean;
    readonly userAgent: string;
    readonly runtime: {
        readonly node: string;
        readonly platform: NodeJS.Platform;
        readonly architecture: string;
    };
    readonly summary: {
        readonly fixtures: number;
        readonly failures: number;
        readonly supportedTargets: readonly string[];
        readonly compatibilityTargets: readonly string[];
    };
    readonly fixtures: readonly {
        readonly id: string;
        readonly label: string;
        readonly supportLevel: 'supported' | 'compatibility' | 'controlled';
        readonly apiUrl: string;
        readonly title: string;
        readonly revisionId?: number;
        readonly revisionTimestamp?: string;
        readonly languageCode: string;
        readonly direction: 'ltr' | 'rtl';
        readonly sourceCharacters: number;
        readonly modules: readonly string[];
        readonly moduleStyles: readonly string[];
        readonly warningCount: number;
        readonly features: RenderManifest['results'][number]['features'];
        readonly passed: boolean;
        readonly failures: readonly string[];
    }[];
}

/** Creates a source-free, machine-readable record of the live compatibility gate. */
export function createCompatibilityReport(
    manifest: RenderManifest,
    failures: readonly ValidationFailure[],
): CompatibilityReport {
    const failuresByFixture = new Map<string, string[]>();
    for (const failure of failures) {
        const entries = failuresByFixture.get(failure.fixtureId) ?? [];
        entries.push(failure.message);
        failuresByFixture.set(failure.fixtureId, entries);
    }

    const fixtures = manifest.results.map((result) => {
        const fixtureFailures = failuresByFixture.get(result.id) ?? [];
        return {
            id: result.id,
            label: result.label,
            supportLevel: result.supportLevel,
            apiUrl: result.apiUrl,
            title: result.title,
            ...(result.revisionId === undefined
                ? {}
                : { revisionId: result.revisionId }),
            ...(result.revisionTimestamp === undefined
                ? {}
                : { revisionTimestamp: result.revisionTimestamp }),
            languageCode: result.languageCode,
            direction: result.direction,
            sourceCharacters: result.sourceCharacters,
            modules: [...result.modules].sort(),
            moduleStyles: [...result.moduleStyles].sort(),
            warningCount: result.warnings.length,
            features: result.features,
            passed: fixtureFailures.length === 0,
            failures: fixtureFailures,
        };
    });

    return {
        schemaVersion: 1,
        generatedAt: manifest.generatedAt,
        mode: 'anonymous-read-only',
        passed: failures.length === 0,
        userAgent: manifest.userAgent,
        runtime: {
            node: process.version,
            platform: process.platform,
            architecture: process.arch,
        },
        summary: {
            fixtures: fixtures.length,
            failures: failures.length,
            supportedTargets: fixtures
                .filter((fixture) => fixture.supportLevel === 'supported')
                .map((fixture) => fixture.id),
            compatibilityTargets: fixtures
                .filter((fixture) => fixture.supportLevel === 'compatibility')
                .map((fixture) => fixture.id),
        },
        fixtures,
    };
}

/** Writes a stable report without any fetched wikitext or rendered HTML. */
export async function writeCompatibilityReport(
    path: string,
    report: CompatibilityReport,
): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 4)}\n`, 'utf8');
}
