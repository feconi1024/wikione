import { defineConfig, devices } from '@playwright/test';

import baseConfig from './playwright.config.js';

/** Exercise the installed Microsoft Edge without reusing a personal profile. */
export default defineConfig({
    ...baseConfig,
    grepInvert: /@visual/u,
    projects: [
        {
            name: 'edge-desktop',
            use: { ...devices['Desktop Edge'], channel: 'msedge' },
        },
    ],
    workers: 1,
});
