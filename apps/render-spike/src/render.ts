import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { MediaWikiClient } from '@wikione/mediawiki';
import {
    createPreviewDocument,
    inspectRenderedFeatures,
} from '@wikione/preview-document';

import { fixturePath, loadFixtures, type RenderFixture } from './config.js';
import type { RenderManifest, RenderResult } from './manifest.js';

export interface RenderAllOptions {
    readonly fixturesDirectory?: string;
    readonly outputDirectory?: string;
    readonly timeoutMilliseconds?: number;
    readonly userAgent: string;
}

export async function renderAllFixtures(
    options: RenderAllOptions,
): Promise<RenderManifest> {
    const fixturesDirectory =
        options.fixturesDirectory ?? resolve(process.cwd(), 'fixtures');
    const outputDirectory =
        options.outputDirectory ??
        resolve(process.cwd(), '../../artifacts/render-spike');
    const fixtures = await loadFixtures(fixturesDirectory);
    await mkdir(outputDirectory, { recursive: true });

    const results: RenderResult[] = [];
    for (const fixture of fixtures) {
        results.push(
            await renderFixture({
                fixture,
                fixturesDirectory,
                outputDirectory,
                ...(options.timeoutMilliseconds === undefined
                    ? {}
                    : { timeoutMilliseconds: options.timeoutMilliseconds }),
                userAgent: options.userAgent,
            }),
        );
    }

    const manifest: RenderManifest = {
        generatedAt: new Date().toISOString(),
        userAgent: options.userAgent,
        results,
    };
    await writeFile(
        resolve(outputDirectory, 'manifest.json'),
        `${JSON.stringify(manifest, null, 4)}\n`,
        'utf8',
    );
    return manifest;
}

async function renderFixture(input: {
    readonly fixture: RenderFixture;
    readonly fixturesDirectory: string;
    readonly outputDirectory: string;
    readonly timeoutMilliseconds?: number;
    readonly userAgent: string;
}): Promise<RenderResult> {
    const client = new MediaWikiClient({
        apiUrl: input.fixture.apiUrl,
        userAgent: input.userAgent,
        ...(input.timeoutMilliseconds === undefined
            ? {}
            : { timeoutMilliseconds: input.timeoutMilliseconds }),
    });
    const site = await client.getSiteInformation();
    const revision = input.fixture.revisionId
        ? await client.getRevisionSource({
              revisionId: input.fixture.revisionId,
          })
        : undefined;
    const source = revision
        ? revision.source
        : await readFile(
              fixturePath(
                  input.fixturesDirectory,
                  input.fixture.sourceFile ?? '',
              ),
              'utf8',
          );
    if (revision && revision.contentModel !== 'wikitext') {
        throw new TypeError(
            `Fixture ${input.fixture.id} uses unsupported content model ${revision.contentModel}.`,
        );
    }

    const parsed = await client.parsePreview({
        title: revision?.title ?? input.fixture.title,
        source,
        ...(revision ? { revisionId: revision.revisionId } : {}),
    });
    const html = createPreviewDocument({
        wikiBaseUrl: input.fixture.wikiBaseUrl,
        siteName: site.siteName,
        languageCode: site.languageCode,
        direction: site.direction,
        parsed,
    });
    const outputFile = `${input.fixture.id}.html`;
    await writeFile(resolve(input.outputDirectory, outputFile), html, 'utf8');

    return {
        id: input.fixture.id,
        label: input.fixture.label,
        supportLevel: input.fixture.supportLevel,
        wikiBaseUrl: input.fixture.wikiBaseUrl,
        apiUrl: input.fixture.apiUrl,
        title: parsed.title,
        ...(revision
            ? {
                  revisionId: revision.revisionId,
                  revisionTimestamp: new Date(revision.timestamp).toISOString(),
              }
            : {}),
        languageCode: site.languageCode,
        direction: site.direction,
        sourceCharacters: source.length,
        outputFile: basename(outputFile),
        modules: [...parsed.modules],
        moduleStyles: [...parsed.moduleStyles],
        warnings: [...parsed.warnings],
        features: inspectRenderedFeatures(html),
    };
}
