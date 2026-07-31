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

test('@a11y edits wikitext, recompiles continuously, and retains the last good preview', async ({
    isMobile,
    page,
}) => {
    const state = await mockServices(page);
    await page.goto('/');

    const sourcePane = page.locator('.source-pane');
    const previewPane = page.locator('.preview-pane');
    await expect(sourcePane).toBeVisible();
    if (isMobile) {
        await expect(previewPane).toBeHidden();
    } else {
        await expect(previewPane).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');

    if (!isMobile) {
        const sourceBox = await sourcePane.boundingBox();
        const previewBox = await previewPane.boundingBox();
        expect(sourceBox).not.toBeNull();
        expect(previewBox).not.toBeNull();
        expect(sourceBox?.x ?? 0).toBeLessThan(previewBox?.x ?? 0);
    }

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
    if (isMobile) {
        await page
            .getByRole('button', { name: 'Preview', exact: true })
            .click();
    }
    await expect(compiledBody(page)).toContainText('Edited Earth');
    if (!isMobile) {
        await expect(
            page.getByRole('button', { name: 'Live section' }),
        ).toBeVisible();
    }

    if (isMobile) {
        await page.getByRole('button', { name: 'Source', exact: true }).click();
    }
    await selectAllEditorText(editor);
    await page.getByRole('button', { name: 'Bold selected text' }).click();
    await expect(editor).toContainText("'''== Live section ==");
    if (isMobile) {
        await page
            .getByRole('button', { name: 'Preview', exact: true })
            .click();
    }
    await expect(compiledBody(page)).toContainText("'''== Live section ==");

    if (!isMobile) {
        const separator = page.getByRole('separator', {
            name: 'Resize source and preview panes',
        });
        await expect(separator).toHaveAttribute('aria-valuenow', '50');
        await separator.press('ArrowRight');
        await expect(separator).toHaveAttribute('aria-valuenow', '53');
        await separator.press('Home');
        await expect(separator).toHaveAttribute('aria-valuenow', '25');
        await separator.press('End');
        await expect(separator).toHaveAttribute('aria-valuenow', '75');
    }

    const goodPreviewText = await compiledBody(page).textContent();
    if (isMobile) {
        await page.getByRole('button', { name: 'Source', exact: true }).click();
    }
    await replaceEditorSource(page, editor, 'FAIL preview request');
    if (isMobile) {
        await page
            .getByRole('button', { name: 'Preview', exact: true })
            .click();
    }
    await expect(
        page.getByText('Preview needs attention', { exact: true }),
    ).toBeVisible();
    await expect(compiledBody(page)).toHaveText(goodPreviewText ?? '');
    await expectNoSeriousAccessibilityViolations(page, true);
});

test('@a11y persists a source-only local draft and has no serious accessibility violations', async ({
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
    await expect(page.locator('.visually-hidden')).toContainText(
        'Saved locally',
    );
    await page.reload();

    await expect(page.locator('.cm-content')).toContainText('Browser draft');
    await expect(page.locator('.privacy-bar')).toContainText(
        /Restored your local draft from/u,
    );
    await expectNoSeriousAccessibilityViolations(page, true);
});

test('preserves composed multilingual input through instant recompilation', async ({
    page,
}) => {
    const state = await mockServices(page);
    await page.goto('/');

    const editor = page.locator('.cm-content');
    await editor.click();
    await selectAllEditorText(editor);
    await editor.dispatchEvent('compositionstart', { data: '' });
    await page.keyboard.insertText('萌娘百科 العربية 🌐');
    await editor.dispatchEvent('compositionend', {
        data: '萌娘百科 العربية 🌐',
    });

    await expect(editor).toContainText('萌娘百科 العربية 🌐');
    await expect
        .poll(() => state.requests.at(-1)?.source)
        .toBe('萌娘百科 العربية 🌐');
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

test('@a11y registers a WikiOne identity and keeps Wikimedia connection separate', async ({
    context,
    page,
}) => {
    await mockServices(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expectNoSeriousAccessibilityViolations(page, true);
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
    expect(await context.cookies(apiBaseUrl)).toContainEqual(
        expect.objectContaining({
            name: 'wikione_session_local',
            httpOnly: true,
            value: 'browser-test-session',
        }),
    );
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

    await expectNoSeriousAccessibilityViolations(page);

    await page.getByRole('button', { name: /Updated editor/u }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(
        (await context.cookies(apiBaseUrl)).some(
            (cookie) => cookie.name === 'wikione_session_local',
        ),
    ).toBe(false);
});

test('@a11y reviews a semantic diff and cannot call the disabled publish endpoint', async ({
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
    await expect(
        page.getByRole('deletion').filter({ hasText: 'Remote wiki source' }),
    ).toContainText('Remote wiki source');
    await expect(
        page.getByRole('insertion').filter({ hasText: 'Improved source' }),
    ).toContainText('Improved source');
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
    await expectNoSeriousAccessibilityViolations(page, true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(reviewButton).toBeFocused();
});

test('@a11y resolves an overlapping three-way conflict without losing the draft', async ({
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
    await expectNoSeriousAccessibilityViolations(page, true);
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

test('@a11y shows mobile privacy and review sheets without horizontal overflow', async ({
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
    await expectNoSeriousAccessibilityViolations(page, true);

    await page.goto('/');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        ),
    ).toBe(false);
    await expectNoSeriousAccessibilityViolations(page, true);
});

test('@a11y traps modal focus, restores focus, and audits every public route', async ({
    page,
}) => {
    await mockServices(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');

    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    await signIn.click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to WikiOne' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Username')).toBeFocused();
    const closeSignIn = page.getByRole('button', { name: 'Close sign-in' });
    await closeSignIn.focus();
    await closeSignIn.press('Shift+Tab');
    await expect(
        dialog.getByRole('button', { name: 'Sign in', exact: true }).last(),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closeSignIn).toBeFocused();
    await expectNoSeriousAccessibilityViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(signIn).toBeFocused();

    for (const route of ['/account', '/connected-apps', '/privacy']) {
        await page.goto(route);
        await expectNoSeriousAccessibilityViolations(page);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth > window.innerWidth,
            ),
        ).toBe(false);
    }

    await page.goto('/');
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');
    const previewUrl = await page
        .locator('iframe[title^="Compiled preview"]')
        .getAttribute('src');
    expect(previewUrl).toBeTruthy();
    await page.goto(previewUrl ?? 'about:blank');
    await expect(page.getByRole('main')).toContainText('Welcome to WikiOne');
    await expectNoSeriousAccessibilityViolations(page);
});

test('@a11y preserves 400% equivalent reflow and visible focus in forced colors', async ({
    page,
}) => {
    // A 1,280 CSS-pixel desktop viewport at 400% browser zoom exposes roughly
    // 320 CSS pixels. This deterministic proxy complements, but does not
    // replace, the manual browser-zoom sign-off.
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({
        forcedColors: 'active',
        reducedMotion: 'reduce',
    });
    await mockServices(page);

    await page.goto('/');
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');
    await expectNoDocumentOverflow(page);

    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    await signIn.focus();
    const focusIndicator = await signIn.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
            style: style.outlineStyle,
            width: Number.parseFloat(style.outlineWidth),
        };
    });
    expect(focusIndicator.style).not.toBe('none');
    expect(focusIndicator.width).toBeGreaterThanOrEqual(2);
    await expectNoSeriousAccessibilityViolations(page, true);

    await page.goto('/privacy');
    await expect(
        page.getByRole('heading', { name: 'Privacy and data controls' }),
    ).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectNoSeriousAccessibilityViolations(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectNoSeriousAccessibilityViolations(page, true);
});

test('@visual captures deterministic public-beta surfaces', async ({
    isMobile,
    page,
}) => {
    const state = await mockServices(page);
    await page.goto('/');
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    await expect(page).toHaveScreenshot('editor-shell.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.015,
    });

    await replaceEditorSource(
        page,
        page.locator('.cm-content'),
        'FAIL visual preview',
    );
    if (isMobile) {
        await page
            .getByRole('button', { name: 'Preview', exact: true })
            .click();
    }
    await expect(
        page.getByText('Preview needs attention', { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('preview-error.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.015,
    });
    if (isMobile) {
        await page.getByRole('button', { name: 'Source', exact: true }).click();
    }
    await replaceEditorSource(
        page,
        page.locator('.cm-content'),
        '== Visual baseline ==\n\nStable source',
    );
    await expect(page.locator('.status-pill')).toHaveText('Preview current');

    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('authentication-dialog.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.015,
    });
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Username').fill('Example');
    await page.getByLabel('Display name').fill('Example editor');
    await page.getByLabel('Password').fill('correct horse battery staple');
    await page
        .locator('form')
        .getByRole('button', { name: 'Create account', exact: true })
        .click();

    const identity = page.getByRole('button', { name: /Example editor/u });
    await identity.click();
    await page.getByRole('menuitem', { name: 'Account and security' }).click();
    await expect(
        page.getByRole('heading', { name: 'Account and security' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('account-route.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.015,
    });

    await identity.click();
    await page.getByRole('menuitem', { name: 'Connected apps' }).click();
    await expect(
        page.getByRole('heading', { name: 'Connected apps' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('connected-apps-route.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.015,
    });

    await page.goto('/privacy');
    await expect(
        page.getByRole('heading', { name: 'Privacy and data controls' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('privacy-route.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.015,
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Load page' }).click();
    await replaceEditorSource(
        page,
        page.locator('.cm-content'),
        '== Earth ==\n\nMy concurrent source',
    );
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('publish-review.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.015,
    });

    state.prepareResult = {
        status: 'conflict',
        reason: 'revision-changed',
        latestRevision: { id: 124, timestamp: generatedAt },
        latestSource: '== Earth ==\n\nRemote concurrent source',
    };
    await page.getByLabel(/Edit summary/u).fill('Resolve concurrent edit');
    await page.getByRole('button', { name: 'Check latest revision' }).click();
    await expect(
        page.getByRole('heading', { name: '1 source conflict' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('publish-conflict.png', {
        animations: 'disabled',
        maxDiffPixelRatio: 0.015,
    });
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
                headers: {
                    'set-cookie':
                        'wikione_session_local=browser-test-session; Path=/; HttpOnly; SameSite=Strict',
                },
                json: { session },
            });
        });
    }
    await page.route(`${apiBaseUrl}/v1/auth/logout`, async (route) => {
        session = anonymousSession();
        await route.fulfill({
            status: 204,
            body: '',
            headers: {
                'set-cookie':
                    'wikione_session_local=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
            },
        });
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
    await selectAllEditorText(editor);
    await page.keyboard.insertText(source);
}

async function selectAllEditorText(
    editor: ReturnType<Page['locator']>,
): Promise<void> {
    // Playwright's emulated mobile WebKit uses the macOS editing shortcut even
    // when the host runs Windows. Sending both leaves the document selected on
    // every supported engine without relying on user-agent detection.
    await editor.press('Control+A');
    await editor.press('Meta+A');
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

async function expectNoSeriousAccessibilityViolations(
    page: Page,
    excludePreview = false,
): Promise<void> {
    const builder = new AxeBuilder({ page });
    if (excludePreview) {
        builder.exclude('iframe');
    }
    const accessibility = await builder.analyze();
    expect(
        accessibility.violations.filter(
            (violation) =>
                violation.impact === 'critical' ||
                violation.impact === 'serious',
        ),
    ).toEqual([]);
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
    expect(
        await page.evaluate(
            () =>
                document.documentElement.scrollWidth <=
                document.documentElement.clientWidth,
        ),
    ).toBe(true);
}
