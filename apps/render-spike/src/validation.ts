import type { FixtureExpectation, RenderFixture } from './config.js';
import type { RenderManifest, RenderResult } from './manifest.js';

export interface ValidationFailure {
    readonly fixtureId: string;
    readonly message: string;
}

export function validateManifest(
    manifest: RenderManifest,
    fixtures: readonly RenderFixture[],
): readonly ValidationFailure[] {
    const results = new Map(
        manifest.results.map((result) => [result.id, result]),
    );
    const failures: ValidationFailure[] = [];
    for (const fixture of fixtures) {
        const result = results.get(fixture.id);
        if (!result) {
            failures.push({
                fixtureId: fixture.id,
                message: 'No render result was produced.',
            });
            continue;
        }
        failures.push(...validateResult(result, fixture.expected));
    }
    return failures;
}

function validateResult(
    result: RenderResult,
    expected: FixtureExpectation,
): readonly ValidationFailure[] {
    const failures: ValidationFailure[] = [];
    checkEqual(
        failures,
        result,
        'direction',
        result.direction,
        expected.direction,
    );
    checkMinimum(
        failures,
        result,
        'source characters',
        result.sourceCharacters,
        expected.minimumSourceCharacters,
    );
    checkMinimum(
        failures,
        result,
        'images',
        result.features.images,
        expected.minimumImages,
    );
    checkMinimum(
        failures,
        result,
        'figures',
        result.features.figures,
        expected.minimumFigures,
    );
    checkMinimum(
        failures,
        result,
        'tables',
        result.features.tables,
        expected.minimumTables,
    );
    checkMinimum(
        failures,
        result,
        'math elements',
        result.features.mathElements,
        expected.minimumMathElements,
    );
    checkMinimum(
        failures,
        result,
        'reference lists',
        result.features.referenceLists,
        expected.minimumReferenceLists,
    );
    checkMinimum(
        failures,
        result,
        'audio elements',
        result.features.audioElements,
        expected.minimumAudioElements,
    );
    checkMinimum(
        failures,
        result,
        'video elements',
        result.features.videoElements,
        expected.minimumVideoElements,
    );
    checkMinimum(
        failures,
        result,
        'interactive elements',
        result.features.interactiveElements,
        expected.minimumInteractiveElements,
    );
    return failures;
}

function checkMinimum(
    failures: ValidationFailure[],
    result: RenderResult,
    label: string,
    actual: number,
    minimum: number | undefined,
): void {
    if (minimum !== undefined && actual < minimum) {
        failures.push({
            fixtureId: result.id,
            message: `Expected at least ${String(minimum)} ${label}; found ${String(actual)}.`,
        });
    }
}

function checkEqual(
    failures: ValidationFailure[],
    result: RenderResult,
    label: string,
    actual: string,
    expected: string,
): void {
    if (actual !== expected) {
        failures.push({
            fixtureId: result.id,
            message: `Expected ${label} ${expected}; found ${actual}.`,
        });
    }
}
