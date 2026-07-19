import { resolve } from 'node:path';

import {
    createCompatibilityReport,
    writeCompatibilityReport,
} from './compatibility-report.js';
import { loadFixtures } from './config.js';
import { renderAllFixtures } from './render.js';
import { validateManifest } from './validation.js';

const userAgent =
    process.env.WIKIONE_USER_AGENT ??
    'WikiOne/0.1 compatibility-gate (https://github.com/feconi1024/wikione)';
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const fixturesDirectory = resolve(import.meta.dirname, '../fixtures');
const outputDirectory = resolve(repositoryRoot, 'artifacts/render-spike');
const timeoutMilliseconds = readTimeout(
    process.env.WIKIONE_LIVE_TIMEOUT_MILLISECONDS,
);
const configuredReportPath = process.env.WIKIONE_COMPAT_REPORT_PATH?.trim();
const reportPath = configuredReportPath
    ? resolve(repositoryRoot, configuredReportPath)
    : resolve(outputDirectory, 'compatibility-report.json');
const fixtures = await loadFixtures(fixturesDirectory);
const manifest = await renderAllFixtures({
    fixturesDirectory,
    outputDirectory,
    timeoutMilliseconds,
    userAgent,
});
const failures = validateManifest(manifest, fixtures);
const report = createCompatibilityReport(manifest, failures);
await writeCompatibilityReport(reportPath, report);

if (failures.length > 0) {
    for (const failure of failures) {
        process.stderr.write(`${failure.fixtureId}: ${failure.message}\n`);
    }
    process.exitCode = 1;
} else {
    process.stdout.write(
        `Validated ${String(manifest.results.length)} sequential read-only MediaWiki fixtures. Report: ${reportPath}\n`,
    );
}

function readTimeout(value: string | undefined): number {
    const parsed = value?.trim() ? Number(value) : 30_000;
    if (!Number.isSafeInteger(parsed) || parsed < 1_000 || parsed > 60_000) {
        throw new RangeError(
            'WIKIONE_LIVE_TIMEOUT_MILLISECONDS must be an integer from 1000 to 60000.',
        );
    }
    return parsed;
}
