import { renderAllFixtures } from './render.js';

const userAgent =
    process.env.WIKIONE_USER_AGENT ??
    'WikiOne-Milestone0/0.0 (https://github.com/feconi1024/wikione)';

const manifest = await renderAllFixtures({ userAgent });
for (const result of manifest.results) {
    process.stdout.write(
        `${result.id}: ${result.outputFile} (${String(result.sourceCharacters)} source characters)\n`,
    );
}
