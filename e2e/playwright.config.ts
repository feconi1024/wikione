import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
    expect: { timeout: 8_000 },
    forbidOnly: Boolean(process.env.CI),
    fullyParallel: false,
    outputDir: `${repositoryRoot}/test-results`,
    reporter: process.env.CI ? 'github' : 'list',
    retries: process.env.CI ? 1 : 0,
    testDir: repositoryRoot + '/e2e',
    timeout: 30_000,
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:5173',
        screenshot: 'only-on-failure',
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'pnpm --filter @wikione/web dev',
        cwd: repositoryRoot,
        reuseExistingServer: !process.env.CI,
        stderr: 'pipe',
        stdout: 'pipe',
        timeout: 120_000,
        url: 'http://127.0.0.1:5173',
    },
});
