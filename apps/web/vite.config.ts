import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@wikione/contracts': fileURLToPath(
                new URL(
                    '../../packages/contracts/src/index.ts',
                    import.meta.url,
                ),
            ),
            '@wikione/editor-core': fileURLToPath(
                new URL(
                    '../../packages/editor-core/src/index.ts',
                    import.meta.url,
                ),
            ),
            '@wikione/publishing-core': fileURLToPath(
                new URL(
                    '../../packages/publishing-core/src/index.ts',
                    import.meta.url,
                ),
            ),
            '@wikione/wikitext-editor': fileURLToPath(
                new URL(
                    '../../packages/wikitext-editor/src/index.ts',
                    import.meta.url,
                ),
            ),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
    },
    preview: {
        port: 5173,
        strictPort: true,
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (
                        id.includes('/node_modules/@codemirror/') ||
                        id.includes('/node_modules/@lezer/')
                    ) {
                        return 'editor-engine';
                    }
                    if (id.includes('/node_modules/vue/')) {
                        return 'vue-runtime';
                    }
                    return undefined;
                },
            },
        },
    },
});
