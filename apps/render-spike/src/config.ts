import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';

const expectedSchema = z.object({
    direction: z.enum(['ltr', 'rtl']),
    minimumSourceCharacters: z.int().nonnegative(),
    minimumImages: z.int().nonnegative().optional(),
    minimumFigures: z.int().nonnegative().optional(),
    minimumTables: z.int().nonnegative().optional(),
    minimumMathElements: z.int().nonnegative().optional(),
    minimumReferenceLists: z.int().nonnegative().optional(),
    minimumAudioElements: z.int().nonnegative().optional(),
    minimumVideoElements: z.int().nonnegative().optional(),
    minimumInteractiveElements: z.int().nonnegative().optional(),
});

const fixtureSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        label: z.string().min(1),
        wikiBaseUrl: z.url().startsWith('https://'),
        apiUrl: z.url().startsWith('https://'),
        title: z.string().min(1),
        revisionId: z.int().positive().optional(),
        sourceFile: z.string().min(1).optional(),
        expected: expectedSchema,
    })
    .refine(
        (fixture) =>
            Number(Boolean(fixture.revisionId)) +
                Number(Boolean(fixture.sourceFile)) ===
            1,
        {
            message:
                'Each fixture needs exactly one of revisionId or sourceFile.',
        },
    );

const configurationSchema = z.object({
    fixtures: z.array(fixtureSchema).min(1),
});

export type RenderFixture = z.infer<typeof fixtureSchema>;
export type FixtureExpectation = z.infer<typeof expectedSchema>;

export async function loadFixtures(
    fixturesDirectory = resolve(process.cwd(), 'fixtures'),
): Promise<readonly RenderFixture[]> {
    const configurationPath = resolve(fixturesDirectory, 'fixtures.json');
    const configuration = configurationSchema.parse(
        JSON.parse(await readFile(configurationPath, 'utf8')),
    );
    const identifiers = new Set<string>();
    for (const fixture of configuration.fixtures) {
        if (identifiers.has(fixture.id)) {
            throw new TypeError(`Duplicate fixture ID: ${fixture.id}`);
        }
        identifiers.add(fixture.id);
    }
    return configuration.fixtures;
}

export function fixturePath(
    fixturesDirectory: string,
    sourceFile: string,
): string {
    if (!/^[a-zA-Z0-9._-]+$/u.test(sourceFile)) {
        throw new TypeError(`Unsafe fixture filename: ${sourceFile}`);
    }
    return resolve(fixturesDirectory, sourceFile);
}
