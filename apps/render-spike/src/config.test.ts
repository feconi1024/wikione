import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixturePath, loadFixtures } from './config.js';

describe('render fixture configuration', () => {
    it('loads exactly one source mechanism per fixture', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'wikione-fixtures-'));
        await writeFile(
            join(directory, 'fixtures.json'),
            JSON.stringify({
                fixtures: [
                    {
                        id: 'example',
                        label: 'Example',
                        supportLevel: 'supported',
                        wikiBaseUrl: 'https://en.wikipedia.org',
                        apiUrl: 'https://en.wikipedia.org/w/api.php',
                        title: 'Example',
                        revisionId: 1,
                        expected: {
                            direction: 'ltr',
                            minimumSourceCharacters: 1,
                        },
                    },
                ],
            }),
        );

        await expect(loadFixtures(directory)).resolves.toHaveLength(1);
    });

    it('rejects path traversal in local fixtures', () => {
        expect(() => fixturePath('fixtures', '../secret')).toThrow('Unsafe');
    });
});
