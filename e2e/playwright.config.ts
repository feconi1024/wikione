import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * WebKit renders and settles the CodeMirror surface far slower than Chromium or
 * Gecko on Windows and Linux CI hosts. Measured WebKit runs reach roughly 26 s
 * against the 30 s budget the other engines clear in under 10 s, so the shared
 * budget failed intermittently purely from host contention. WebKit projects get
 * their own budgets instead so a real hang is still caught while a slow-but-
 * correct engine is not reported as a browser-compatibility failure.
 */
const webkitTimeouts = {
    expect: 16_000,
    test: 90_000,
};

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
            expect: { timeout: webkitTimeouts.expect },
            timeout: webkitTimeouts.test,
            use: { ...devices['Desktop Safari'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'mobile-safari',
            expect: { timeout: webkitTimeouts.expect },
            timeout: webkitTimeouts.test,
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
