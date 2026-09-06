import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type {
    PublishPreparationResult,
    SessionStatus,
} from '@wikione/contracts';

import { createPreviewDocument } from '../packages/preview-document/src/preview-document.js';

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
        const previewSurfaceBox = await page
            .locator('.preview-surface')
            .boundingBox();
        const previewFrameBox = await page
            .locator('.preview-surface iframe')
            .boundingBox();
        const previewStatusBox = await page
            .locator('.pane-statusbar--preview')
            .boundingBox();
        expect(sourceBox).not.toBeNull();
        expect(previewBox).not.toBeNull();
        expect(previewSurfaceBox).not.toBeNull();
        expect(previewFrameBox).not.toBeNull();
        expect(previewStatusBox).not.toBeNull();
        expect(sourceBox?.x ?? 0).toBeLessThan(previewBox?.x ?? 0);
        expect(previewSurfaceBox?.height ?? 0).toBeGreaterThan(
            (previewBox?.height ?? 0) * 0.6,
        );
        expect(
            Math.abs(
                (previewFrameBox?.height ?? 0) -
                    (previewSurfaceBox?.height ?? 0),
            ),
        ).toBeLessThan(2);
        expect(
            previewStatusBox?.height ?? Number.POSITIVE_INFINITY,
        ).toBeLessThan(60);
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

test('@a11y follows system appearance and preserves an explicit theme across reloads', async ({
    page,
}) => {
    await mockServices(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');
    const root = page.locator('html');
    const appearance = page.getByRole('combobox', { name: 'Appearance' });
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expectNoSeriousAccessibilityViolations(page, true);

    await appearance.selectOption('light');
    await page.reload();
    await expect(root).toHaveAttribute('data-theme', 'light');
    await expect(appearance).toHaveValue('light');
    await appearance.selectOption('system');
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(root).toHaveAttribute('data-theme', 'light');

    await appearance.selectOption('dark');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expectNoSeriousAccessibilityViolations(page, true);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expectNoSeriousAccessibilityViolations(page, true);
    await page.keyboard.press('Escape');
    for (const route of ['/account', '/connected-apps', '/privacy']) {
        await page.goto(route);
        await expect(root).toHaveAttribute('data-theme', 'dark');
        await expectNoDocumentOverflow(page);
        await expectNoSeriousAccessibilityViolations(page);
    }
});

test('appearance remains usable when browser storage is unavailable', async ({
    page,
}) => {
    await mockServices(page);
    await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
            get() {
                throw new DOMException('Storage unavailable', 'SecurityError');
            },
        });
    });
    await page.goto('/');
    await page
        .getByRole('combobox', { name: 'Appearance' })
        .selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.cm-content')).toContainText(
        'Welcome to WikiOne',
    );
});

test('@visual captures dark editor and dialog surfaces', async ({ page }) => {
    await mockServices(page);
    await page.goto('/');
    await expect(compiledBody(page)).toContainText('Welcome to WikiOne');
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    await page
        .getByRole('combobox', { name: 'Appearance' })
        .selectOption('dark');
    await expect(page).toHaveScreenshot('editor-dark.png', {
        maxDiffPixelRatio: 0.015,
    });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('authentication-dark.png', {
        maxDiffPixelRatio: 0.015,
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('review-dark.png', {
        maxDiffPixelRatio: 0.015,
    });
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

test('all toolbar commands preserve selection and support undo and redo', async ({
    page,
}) => {
    await mockServices(page);
    await page.goto('/');
    const editor = page.locator('.cm-content');
    const mac = await page.evaluate(() => /Mac/u.test(navigator.platform));
    for (const [name, expected] of [
        ['Bold selected text', "'''sample'''"],
        ['Italicize selected text', "''sample''"],
        ['Insert section heading', '== sample =='],
        ['Insert internal wiki link', '[[sample]]'],
        ['Insert template', '{{sample}}'],
        ['Insert reference', '<ref>sample</ref>'],
        ['Insert bulleted list', '* sample'],
        ['Insert numbered list', '# sample'],
        ['Insert wiki table', '{| class="wikitable"'],
    ] as const) {
        await replaceEditorSource(page, editor, 'sample');
        await selectAllEditorText(editor);
        await page.getByRole('button', { name, exact: true }).click();
        await expect(editor).toContainText(expected);
        await expect(editor).toBeFocused();
        await editor.press(mac ? 'Meta+z' : 'Control+z');
        await expect(editor).toHaveText('sample');
        await editor.press(mac ? 'Meta+Shift+z' : 'Control+y');
        await expect(editor).toContainText(expected);
    }
});

test('outline, search, autocomplete and pointer splitter remain interactive', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockServices(page);
    await page.goto('/');
    const editor = page.locator('.cm-content');
    const mac = await page.evaluate(() => /Mac/u.test(navigator.platform));
    await replaceEditorSource(
        page,
        editor,
        '== First ==\n\nAlpha\n\n== Second ==\n\nBeta',
    );
    await page.getByRole('button', { name: 'Second', exact: true }).click();
    await expect(page.locator('.pane-statusbar').first()).toContainText(
        'Ln 5, Col 1',
    );
    await editor.press(mac ? 'Meta+f' : 'Control+f');
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('Beta');
    await page.getByRole('button', { name: 'next', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(editor).toBeFocused();
    await editor.press(mac ? 'Meta+ArrowDown' : 'Control+End');
    await editor.press('Enter');
    await editor.press('Control+Space');
    await page.getByRole('option', { name: /Internal link/u }).click();
    await expect(editor).toContainText('[[Page title|label]]');
    const separator = page.getByRole('separator');
    const box = await separator.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + 100, box!.y + 80, { steps: 5 });
    await page.mouse.up();
    await expect(separator).not.toHaveAttribute('aria-valuenow', '50');
});

test('rapid typing compiles once after the burst and retry recovers a failed preview', async ({
    page,
}) => {
    const state = await mockServices(page);
    await page.goto('/');
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    const before = state.requests.length;
    const editor = page.locator('.cm-content');
    await editor.click();
    await editor.press('Control+End');
    await page.keyboard.type(' burst of twenty keys', { delay: 20 });
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    await expect.poll(() => state.requests.length).toBe(before + 1);
    await page.route(`${apiBaseUrl}/v1/previews`, (route) =>
        route.abort('failed'),
    );
    await page.getByRole('button', { name: 'Compile preview again' }).click();
    await expect(page.locator('.status-pill')).toHaveText(
        'Preview needs attention',
    );
    await page.unroute(`${apiBaseUrl}/v1/previews`);
    // Restore the deterministic service routes after removing the failure override.
    await mockServices(page);
    await page.getByRole('button', { name: 'Compile preview again' }).click();
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
});

test('navigation links and browser history preserve the open draft', async ({
    page,
}) => {
    await mockServices(page);
    await page.goto('/');
    await replaceEditorSource(
        page,
        page.locator('.cm-content'),
        'Navigation draft',
    );
    await page.getByRole('link', { name: 'Connections', exact: true }).click();
    await expect(page).toHaveURL('/connected-apps');
    await page.getByRole('button', { name: 'Read the privacy notice' }).click();
    await expect(page).toHaveURL('/privacy');
    await page.getByRole('button', { name: 'Review connected apps' }).click();
    await expect(page).toHaveURL('/connected-apps');
    await page.goBack();
    await expect(page).toHaveURL('/privacy');
    await page.getByRole('link', { name: 'WikiOne editor home' }).click();
    await expect(page.locator('.cm-content')).toHaveText('Navigation draft');
    await page.getByRole('link', { name: 'Privacy', exact: true }).click();
    await page.getByRole('link', { name: 'Editor', exact: true }).click();
    await expect(page.locator('.cm-content')).toHaveText('Navigation draft');
});

test('entering a page to load cannot overwrite its existing local draft', async ({
    page,
}) => {
    await mockServices(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Load page' }).click();
    await replaceEditorSource(
        page,
        page.locator('.cm-content'),
        'Important Earth draft',
    );
    await expect(
        page.locator('.visually-hidden[aria-live="polite"]'),
    ).toContainText('Saved locally');
    // Return to the initial Sandbox document, then type the existing page name.
    await page.reload();
    await expect(page.locator('.cm-content')).toContainText(
        'Welcome to WikiOne',
    );
    await page
        .getByRole('textbox', { name: 'Page title', exact: true })
        .fill('Earth');
    // Cross the autosave interval: simply entering a search target must not save
    // the Sandbox source over an existing Earth draft.
    await page.waitForTimeout(1100);
    await page.getByRole('button', { name: 'Load page' }).click();
    await expect(page.locator('.cm-content')).toHaveText(
        'Important Earth draft',
    );
    await page.getByRole('button', { name: 'Keep local draft' }).click();
    await expect(
        page.getByText('Keeping the local browser draft.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Load page' }).click();
    await page.getByRole('button', { name: 'Use wiki version' }).click();
    await expect(page.locator('.cm-content')).toContainText(
        'Remote wiki source',
    );
    await page.getByRole('button', { name: 'Discard saved copy' }).click();
    await expect(page.locator('.privacy-bar')).toContainText(
        'Saved copy removed',
    );
    await expect(page.locator('.cm-content')).toContainText(
        'Remote wiki source',
    );
});

test('clearing the source removes stale compiled content and can compile again', async ({
    page,
}) => {
    await mockServices(page);
    await page.goto('/');
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    const editor = page.locator('.cm-content');
    await editor.click();
    await selectAllEditorText(editor);
    await editor.press('Backspace');
    await expect(page.locator('.preview-surface iframe')).toHaveCount(0);
    await expect(page.locator('.status-pill')).toHaveText('Waiting to compile');
    await replaceEditorSource(page, editor, 'A fresh preview');
    await expect(compiledBody(page)).toContainText('A fresh preview');
});

test('account error recovery, session refresh, password and deletion controls use the mocked API', async ({
    page,
}) => {
    await mockServices(page);
    await page.goto('/');
    const signIn = async () => {
        await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        await page.getByLabel('Username', { exact: true }).fill('Example');
        await page
            .getByLabel('Password', { exact: true })
            .fill('synthetic test password');
        await page
            .locator('form')
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
    };
    const rejectLogin: Parameters<Page['route']>[1] = (route) =>
        route.fulfill({
            status: 401,
            json: {
                code: 'invalid-credentials',
                message: 'Test sign-in rejected.',
            },
        });
    await page.route(`${apiBaseUrl}/v1/auth/login`, rejectLogin);
    await signIn();
    await expect(page.getByRole('alert')).toHaveText('Test sign-in rejected.');
    await page.getByRole('button', { name: 'Close sign-in' }).click();
    await page.unroute(`${apiBaseUrl}/v1/auth/login`, rejectLogin);
    await signIn();
    const identity = page.getByRole('button', {
        name: 'Example editor account menu',
    });
    await identity.click();
    await page.getByRole('menuitem', { name: 'Refresh session' }).click();
    await expect(page.getByText('WikiOne session refreshed.')).toBeVisible();
    await identity.click();
    await page.getByRole('menuitem', { name: 'Account and security' }).click();
    await page
        .getByLabel('Current password', { exact: true })
        .fill('synthetic test password');
    await page
        .getByLabel('New password', { exact: true })
        .fill('updated synthetic password');
    await page
        .getByRole('button', { name: 'Change password', exact: true })
        .click();
    await expect(
        page.getByText('Password changed and previous sessions revoked.'),
    ).toBeVisible();
    await expect(
        page.getByLabel('Current password', { exact: true }),
    ).toBeEmpty();
    await page.getByRole('button', { name: 'Sign out everywhere' }).click();
    await expect(
        page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await signIn();
    await identity.click();
    await page.getByRole('menuitem', { name: 'Account and security' }).click();
    await expect(
        page.getByRole('button', { name: 'Delete my account' }),
    ).toBeDisabled();
    await page
        .getByLabel('Password', { exact: true })
        .fill('synthetic test password');
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(
        page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible();
});

test('manual conflict resolution and every watchlist choice remain usable', async ({
    page,
}) => {
    const state = await mockServices(page);
    state.prepareResult = {
        status: 'conflict',
        reason: 'revision-changed',
        latestRevision: { id: 124, timestamp: generatedAt },
        latestSource: '== Earth ==\n\nTheir edit',
    };
    await page.goto('/');
    await page.getByRole('button', { name: 'Load page' }).click();
    await replaceEditorSource(
        page,
        page.locator('.cm-content'),
        '== Earth ==\n\nMy edit',
    );
    await expect(page.locator('.status-pill')).toHaveText('Preview current');
    await page.getByRole('button', { name: 'Review changes' }).click();
    await expect(
        page.getByRole('button', { name: 'Check latest revision' }),
    ).toBeDisabled();
    await page.getByLabel(/Edit summary/u).fill('Synthetic conflict check');
    for (const name of [
        'Use wiki preference',
        'Watch this page',
        'Unwatch this page',
        'Leave unchanged',
    ]) {
        const radio = page.getByRole('radio', { name, exact: true });
        await radio.check();
        await expect(radio).toBeChecked();
    }
    await page
        .getByText('How target-wiki rejections will be handled', {
            exact: true,
        })
        .click();
    await expect(
        page.getByText('Revision verification', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Check latest revision' }).click();
    await page.getByRole('radio', { name: /Keep mine/u }).check();
    await expect(
        page.getByRole('button', { name: 'Apply resolution' }),
    ).toBeEnabled();
    await page.locator('.conflict-region textarea').fill('Both edits combined');
    await expect(
        page.getByRole('radio', { name: /Use manual text/u }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Apply resolution' }).click();
    await expect(page.locator('.cm-content')).toContainText(
        'Both edits combined',
    );
    expect(state.publishRequests).toBe(0);
});

test('rendered links open a separate tab without exposing the editor window', async ({
    page,
    context,
    isMobile,
}) => {
    await mockServices(page);
    await page.route(`${previewBaseUrl}/previews/*`, (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: '<a href="http://127.0.0.1:4174/wiki-target" target="_blank" rel="noopener noreferrer">Example article</a>',
        }),
    );
    await context.route(`${previewBaseUrl}/wiki-target`, (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: '<h1>Example article</h1>',
        }),
    );
    await page.goto('/');
    if (isMobile) {
        await page
            .getByRole('button', { name: 'Preview', exact: true })
            .click();
    }
    const popupPromise = context.waitForEvent('page');
    await page
        .frameLocator('.preview-surface iframe')
        .getByRole('link', { name: 'Example article' })
        .click();
    const popup = await popupPromise;
    await expect(
        popup.getByRole('heading', { name: 'Example article' }),
    ).toBeVisible();
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await expect(page).toHaveURL('/');
    await expect(page.locator('.cm-content')).toContainText(
        'Welcome to WikiOne',
    );
    await popup.close();
});

test('citation and backlink fragments scroll within the actual generated preview document', async ({
    page,
    context,
    isMobile,
}) => {
    await mockServices(page);
    // Keep this regression offline while exercising the real document generator.
    await page.route('https://en.wikipedia.org/**', (route) =>
        route.fulfill({ body: '', contentType: 'text/javascript' }),
    );
    await page.route(`${previewBaseUrl}/previews/*`, (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: createPreviewDocument({
                wikiBaseUrl: 'https://en.wikipedia.org',
                siteName: 'Wikipedia',
                languageCode: 'en',
                direction: 'ltr',
                parsed: {
                    title: 'Sandbox',
                    displayTitle: 'Sandbox',
                    text: '<p id="cite_ref-1"><a href="#cite_note-1">Citation 1</a></p><div style="height:900px"></div><p id="cite_note-1">Example citation <a href="#cite_ref-1">Back to text</a></p>',
                    headHtml: '',
                    subtitle: '',
                    indicators: [],
                    categoriesHtml: '',
                    modules: [],
                    moduleStyles: [],
                    javascriptConfig: {},
                    warnings: [],
                },
            }),
        }),
    );
    await page.goto('/');
    if (isMobile) {
        await page
            .getByRole('button', { name: 'Preview', exact: true })
            .click();
    }
    const frame = page.frameLocator('.preview-surface iframe');
    await frame.getByRole('link', { name: 'Citation 1', exact: true }).click();
    await expect(
        frame.getByRole('link', { name: 'Back to text' }),
    ).toBeInViewport();
    await frame.getByRole('link', { name: 'Back to text' }).click();
    await expect(
        frame.getByRole('link', { name: 'Citation 1', exact: true }),
    ).toBeInViewport();
    expect(context.pages()).toHaveLength(1);
    expect(
        page
            .frames()
            .find((item) => item.url().includes('/previews/'))
            ?.url(),
    ).toContain('#cite_ref-1');
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
