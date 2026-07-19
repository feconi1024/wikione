import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
    expect: { timeout: 8_000 },
    forbidOnly: Boolean(process.env.CI),
    fullyParallel: false,
    outputDir: `${repositoryRoot}/test-results`,
    projects: [
        {
            name: 'chromium-desktop',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox-desktop',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit-desktop',
            use: { ...devices['Desktop Safari'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 15'] },
        },
    ],
    reporter: process.env.CI ? 'github' : 'list',
    retries: process.env.CI ? 1 : 0,
    snapshotPathTemplate:
        '{testDir}/snapshots/{testFilePath}/{arg}-{projectName}{ext}',
    testDir: repositoryRoot + '/e2e',
    timeout: 30_000,
    use: {
        baseURL: 'http://127.0.0.1:5173',
        colorScheme: 'light',
        contextOptions: { reducedMotion: 'reduce' },
        locale: 'en-US',
        screenshot: 'only-on-failure',
        serviceWorkers: 'block',
        timezoneId: 'UTC',
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
