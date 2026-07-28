import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';

import { buildApi } from './app.js';

const defaultOutputPath = fileURLToPath(
    new URL('../../../openapi/wikione.openapi.json', import.meta.url),
);

/** Writes the exact OpenAPI document served by the API in a stable JSON form. */
async function main(): Promise<void> {
    const outputPath = resolve(process.argv[2] ?? defaultOutputPath);
    const app = await buildApi();
    try {
        await app.ready();
        const document = app.swagger();
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(
            outputPath,
            await format(JSON.stringify(document), {
                parser: 'json',
                singleQuote: true,
                tabWidth: 4,
                trailingComma: 'all',
                useTabs: false,
            }),
            'utf8',
        );
        process.stdout.write(`Wrote ${outputPath}\n`);
    } finally {
        await app.close();
    }
}

void main().catch((error: unknown) => {
    const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
});
