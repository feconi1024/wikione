import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type {
    PublishPreparationResult,
    SessionStatus,
} from '@wikione/contracts';

const apiBaseUrl = 'http://127.0.0.1:3000';
const previewBaseUrl = 'http://127.0.0.1:4174';
const generatedAt = '2026-07-19T00:00:00.000Z';
const expiresAt = '2026-07-19T00:02:00.000Z';

interface MockState {
    readonly requests: MockPreviewRequest[];
    prepareResult?: PublishPreparationResult;
    publishRequests: number;
}

interface MockPreviewRequest {
    readonly wikiId: string;
    readonly title: string;
    readonly source: string;
    readonly contentModel: 'wikitext';
    readonly clientRevision: number;
}

test('edits wikitext, recompiles continuously, and retains the last good preview', async ({
    page,
}) => {
    const state = await mockServices(page);
    await page.goto('/');

    const sourcePane = page.locator('.source-pane');
    const previewPane = page.locator('.preview-pane');
    await expect(sourcePane).toBeVisible();
    await expect(previewPane).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');

    const sourceBox = await sourcePane.boundingBox();
    const previewBox = await previewPane.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    expect(sourceBox?.x ?? 0).toBeLessThan(previewBox?.x ?? 0);

    const editor = page.locator('.cm-content');
    await replaceEditorSource(
        page,
        editor,
        '== Live section ==\n\nEdited Earth',
    );
    await expect
        .poll(() => state.requests.at(-1)?.source)
        .toBe('== Live section ==\n\nEdited Earth');
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    await expect(compiledBody(page)).toContainText('Edited Earth');
    await expect(
        page.getByRole('button', { name: 'Live section' }),
    ).toBeVisible();

    await editor.press('Control+A');
    await page.getByRole('button', { name: 'Bold selected text' }).click();
    await expect(editor).toContainText("'''== Live section ==");

    const separator = page.getByRole('separator', {
        name: 'Resize source and preview panes',
    });
    await expect(separator).toHaveAttribute('aria-valuenow', '50');
    await separator.press('ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', '53');

    const goodPreviewText = await compiledBody(page).textContent();
    await replaceEditorSource(page, editor, 'FAIL preview request');
    await expect(
        page.getByText('Preview needs attention', { exact: true }),
    ).toBeVisible();
    await expect(compiledBody(page)).toHaveText(goodPreviewText ?? '');
});

test('persists a source-only local draft and has no serious accessibility violations', async ({
    page,
}) => {
    await mockServices(page);
    await page.goto('/');
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');

    const editor = page.locator('.cm-content');
    await replaceEditorSource(
        page,
        editor,
        '== Browser draft ==\n\nLocal only',
    );
    await expect(
        page.getByText('Saved locally', { exact: true }),
    ).toBeVisible();
    await page.reload();

    await expect(page.locator('.cm-content')).toContainText('Browser draft');
    await expect(
        page.getByText(/Restored your local draft from/u),
    ).toBeVisible();
    const accessibility = await new AxeBuilder({ page })
        .exclude('iframe')
        .analyze();
    const seriousViolations = accessibility.violations.filter(
        (violation) =>
            violation.impact === 'critical' || violation.impact === 'serious',
    );
    expect(seriousViolations).toEqual([]);
});

test('switches between source and compiled preview on a narrow screen', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockServices(page);
    await page.goto('/');

    await expect(page.locator('.source-pane')).toBeVisible();
    await expect(page.locator('.preview-pane')).toBeHidden();
    await expect(page.getByRole('separator')).toBeHidden();

    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('.source-pane')).toBeHidden();
    await expect(page.locator('.preview-pane')).toBeVisible();
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');
    const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
});

test('registers a WikiOne identity and keeps Wikimedia connection separate', async ({
    page,
}) => {
    await mockServices(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Username').fill('Example');
    await page.getByLabel('Display name').fill('Example editor');
    await page.getByLabel('Password').fill('correct horse battery staple');
    await page
        .locator('form')
        .getByRole('button', { name: 'Create account', exact: true })
        .click();

    await expect(
        page.getByRole('button', { name: /Example editor/u }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Example editor/u }).click();
    await page.getByRole('menuitem', { name: 'Connected apps' }).click();
    await expect(
        page.getByRole('heading', { name: 'Connected apps' }),
    ).toBeVisible();
    await expect(page.getByText(/No wiki account is connected/u)).toBeVisible();
    await expect(
        page.getByRole('button', { name: /Connect Wikipedia/u }),
    ).toBeDisabled();

    await page.getByRole('button', { name: /Example editor/u }).click();
    await page.getByRole('menuitem', { name: 'Account and security' }).click();
    await expect(
        page.getByRole('heading', { name: 'Account and security' }),
    ).toBeVisible();
    await page.getByLabel('Display name').fill('Updated editor');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Display name updated.')).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
        accessibility.violations.filter(
            (violation) =>
                violation.impact === 'critical' ||
                violation.impact === 'serious',
        ),
    ).toEqual([]);

    await page.getByRole('button', { name: /Updated editor/u }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('reviews a semantic diff and cannot call the disabled publish endpoint', async ({
    page,
}) => {
    const state = await mockServices(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Load page' }).click();
    await expect(page.locator('.cm-content')).toContainText(
        'Remote wiki source',
    );
    await replaceEditorSource(
        page,
        page.locator('.cm-content'),
        '== Earth ==\n\nImproved source',
    );
    await expect(page.locator('.status-pill')).toHaveText('Preview current');

    const reviewButton = page.getByRole('button', { name: 'Review changes' });
    await reviewButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('del')).toContainText('Remote wiki source');
    await expect(page.locator('ins')).toContainText('Improved source');
    await page.getByLabel(/Edit summary/u).fill('Improve the page');
    await page.getByLabel('Mark as a minor edit').check();
    await page
        .getByRole('radio', { name: 'Watch this page', exact: true })
        .check();
    await page.getByRole('button', { name: 'Check latest revision' }).click();
    await expect(page.getByText('Ready to update')).toBeVisible();
    await expect(
        page.getByRole('button', { name: /Publish to Wikipedia/u }),
    ).toBeDisabled();
    expect(state.publishRequests).toBe(0);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(reviewButton).toBeFocused();
});

test('resolves an overlapping three-way conflict without losing the draft', async ({
    page,
}) => {
    const state = await mockServices(page);
    state.prepareResult = {
        status: 'conflict',
        reason: 'revision-changed',
        latestRevision: { id: 124, timestamp: generatedAt },
        latestSource: '== Earth ==\n\nRemote concurrent source',
    };
    await page.goto('/');
    await page.getByRole('button', { name: 'Load page' }).click();
    await replaceEditorSource(
        page,
        page.locator('.cm-content'),
        '== Earth ==\n\nMy concurrent source',
    );
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await page.getByLabel(/Edit summary/u).fill('Resolve concurrent edit');
    await page.getByRole('button', { name: 'Check latest revision' }).click();
    await expect(
        page.getByRole('heading', { name: '1 source conflict' }),
    ).toBeVisible();
    await page.getByLabel('Use latest').check();
    await page.getByRole('button', { name: 'Apply resolution' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.locator('.cm-content')).toContainText(
        'Remote concurrent source',
    );
    await expect(
        page.getByText(/Conflict resolution applied locally/u),
    ).toBeVisible();
});

test('shows mobile privacy and review sheets without horizontal overflow', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockServices(page);
    await page.goto('/privacy');
    await expect(
        page.getByRole('heading', { name: 'Privacy and data controls' }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        ),
    ).toBe(false);

    await page.goto('/');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        ),
    ).toBe(false);
});

async function mockServices(page: Page): Promise<MockState> {
    const requests: MockPreviewRequest[] = [];
    const previewSources = new Map<string, string>();
    const state: MockState = { requests, publishRequests: 0 };
    let session: SessionStatus = anonymousSession();

    await page.route(`${apiBaseUrl}/v1/wikis`, async (route) => {
        await route.fulfill({
            json: [
                {
                    id: 'en-wikipedia',
                    displayName: 'English Wikipedia',
                    languageCode: 'en',
                    direction: 'ltr',
                    baseUrl: 'https://en.wikipedia.org',
                    apiUrl: 'https://en.wikipedia.org/w/api.php',
                },
            ],
        });
    });
    await page.route(`${apiBaseUrl}/v1/pages/source`, async (route) => {
        await route.fulfill({
            json: {
                wikiId: 'en-wikipedia',
                title: 'Earth',
                exists: true,
                contentModel: 'wikitext',
                source: '== Earth ==\n\nRemote wiki source',
                baseRevision: { id: 123, timestamp: generatedAt },
                fetchedAt: generatedAt,
            },
        });
    });
    await page.route(`${apiBaseUrl}/v1/previews`, async (route) => {
        const request = route.request().postDataJSON() as MockPreviewRequest;
        requests.push(request);
        if (request.source.includes('FAIL')) {
            await route.fulfill({
                status: 502,
                json: {
                    code: 'mediawiki-unavailable',
                    message: 'The wiki could not process the request.',
                },
            });
            return;
        }
        const id = `r${String(request.clientRevision).padStart(31, '0')}`;
        previewSources.set(id, request.source);
        await route.fulfill({
            json: {
                clientRevision: request.clientRevision,
                renderUrl: `${previewBaseUrl}/previews/${id}`,
                warnings: [],
                generatedAt,
                expiresAt,
            },
        });
    });
    await page.route(`${previewBaseUrl}/previews/**`, async (route) => {
        const id = new URL(route.request().url()).pathname.split('/').at(-1);
        const source = id ? previewSources.get(id) : undefined;
        await route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: `<!doctype html><html lang="en"><head><title>Preview</title></head><body><main data-testid="compiled">${escapeHtml(source ?? 'Preview unavailable')}</main></body></html>`,
        });
    });
    await page.route(`${apiBaseUrl}/v1/auth/session`, async (route) => {
        await route.fulfill({ json: session });
    });
    for (const path of ['register', 'login', 'refresh']) {
        await page.route(`${apiBaseUrl}/v1/auth/${path}`, async (route) => {
            const current =
                session.authenticated && path === 'refresh'
                    ? session.account
                    : {
                          provider: 'wikione' as const,
                          accountId: 'bb2f82ee-29f2-41c9-bd38-630f1228a967',
                          username: 'Example',
                          displayName:
                              path === 'register'
                                  ? ((
                                        route.request().postDataJSON() as {
                                            displayName: string;
                                        }
                                    ).displayName ?? 'Example editor')
                                  : 'Example editor',
                          createdAt: generatedAt,
                      };
            session = authenticatedSession(
                current,
                path === 'refresh' ? 'B'.repeat(43) : 'A'.repeat(43),
            );
            await route.fulfill({
                status: path === 'register' ? 201 : 200,
                json: { session },
            });
        });
    }
    await page.route(`${apiBaseUrl}/v1/auth/logout`, async (route) => {
        session = anonymousSession();
        await route.fulfill({ status: 204, body: '' });
    });
    await page.route(`${apiBaseUrl}/v1/auth/logout-all`, async (route) => {
        session = anonymousSession();
        await route.fulfill({ status: 204, body: '' });
    });
    await page.route(`${apiBaseUrl}/v1/account`, async (route) => {
        if (route.request().method() === 'PATCH' && session.authenticated) {
            const body = route.request().postDataJSON() as {
                displayName: string;
            };
            session = authenticatedSession(
                { ...session.account, displayName: body.displayName },
                session.csrfToken,
            );
            await route.fulfill({ json: { session } });
            return;
        }
        session = anonymousSession();
        await route.fulfill({ status: 204, body: '' });
    });
    await page.route(`${apiBaseUrl}/v1/account/password`, async (route) => {
        await route.fulfill({ json: { session } });
    });
    await page.route(`${apiBaseUrl}/v1/publish/capability`, async (route) => {
        await route.fulfill({
            json: {
                available: false,
                reason: 'oauth-registration-pending',
                message: 'Approval pending.',
            },
        });
    });
    await page.route(`${apiBaseUrl}/v1/publish/prepare`, async (route) => {
        await route.fulfill({
            json:
                state.prepareResult ??
                ({
                    status: 'ready',
                    operation: 'update',
                    latestRevision: { id: 123, timestamp: generatedAt },
                } satisfies PublishPreparationResult),
        });
    });
    await page.route(`${apiBaseUrl}/v1/publish`, async (route) => {
        state.publishRequests += 1;
        await route.fulfill({
            status: 503,
            json: {
                code: 'wikimedia-oauth-unavailable',
                message: 'No edit was submitted.',
            },
        });
    });
    return state;
}

function anonymousSession(): SessionStatus {
    return {
        authenticated: false,
        wikimedia: {
            connected: false,
            reason: 'oauth-registration-pending',
            message: 'Approval pending.',
        },
    };
}

function authenticatedSession(
    account: Extract<SessionStatus, { authenticated: true }>['account'],
    csrfToken: string,
): SessionStatus {
    return {
        authenticated: true,
        account,
        csrfToken,
        expiresAt: '2026-07-19T00:30:00.000Z',
        absoluteExpiresAt: '2026-07-19T08:00:00.000Z',
        wikimedia: anonymousSession().wikimedia,
    };
}

function compiledBody(page: Page) {
    return page
        .frameLocator('iframe[title^="Compiled preview"]')
        .getByTestId('compiled');
}

async function replaceEditorSource(
    page: Page,
    editor: ReturnType<Page['locator']>,
    source: string,
): Promise<void> {
    await editor.click();
    await editor.press('Control+A');
    await page.keyboard.insertText(source);
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
