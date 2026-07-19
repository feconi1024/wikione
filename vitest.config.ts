import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@wikione/auth-core': resolve(
                repositoryRoot,
                'packages/auth-core/src/index.ts',
            ),
            '@wikione/auth-store': resolve(
                repositoryRoot,
                'packages/auth-store/src/index.ts',
            ),
            '@wikione/contracts': resolve(
                repositoryRoot,
                'packages/contracts/src/index.ts',
            ),
            '@wikione/editor-core': resolve(
                repositoryRoot,
                'packages/editor-core/src/index.ts',
            ),
            '@wikione/mediawiki': resolve(
                repositoryRoot,
                'packages/mediawiki/src/index.ts',
            ),
            '@wikione/preview-document': resolve(
                repositoryRoot,
                'packages/preview-document/src/index.ts',
            ),
            '@wikione/preview-store': resolve(
                repositoryRoot,
                'packages/preview-store/src/index.ts',
            ),
            '@wikione/publishing-core': resolve(
                repositoryRoot,
                'packages/publishing-core/src/index.ts',
            ),
            '@wikione/wikitext-editor': resolve(
                repositoryRoot,
                'packages/wikitext-editor/src/index.ts',
            ),
        },
    },
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
        },
        include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    },
});
