import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
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
