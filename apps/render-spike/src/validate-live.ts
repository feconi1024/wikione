import { resolve } from 'node:path';

import { loadFixtures } from './config.js';
import { renderAllFixtures } from './render.js';
import { validateManifest } from './validation.js';

const userAgent =
    process.env.WIKIONE_USER_AGENT ??
    'WikiOne-Milestone0/0.0 (https://github.com/feconi1024/wikione)';
const fixturesDirectory = resolve(process.cwd(), 'fixtures');
const fixtures = await loadFixtures(fixturesDirectory);
const manifest = await renderAllFixtures({ fixturesDirectory, userAgent });
const failures = validateManifest(manifest, fixtures);

if (failures.length > 0) {
    for (const failure of failures) {
        process.stderr.write(`${failure.fixtureId}: ${failure.message}\n`);
    }
    process.exitCode = 1;
} else {
    process.stdout.write(
        `Validated ${String(manifest.results.length)} live MediaWiki render fixtures.\n`,
    );
}
