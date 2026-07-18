import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const apiBaseUrl = 'http://127.0.0.1:3000';
const previewBaseUrl = 'http://127.0.0.1:4174';
const generatedAt = '2026-07-19T00:00:00.000Z';
const expiresAt = '2026-07-19T00:02:00.000Z';

interface MockState {
    readonly requests: MockPreviewRequest[];
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
    await expect(
        page.getByRole('button', { name: 'Sign in unavailable' }),
    ).toBeDisabled();
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

async function mockServices(page: Page): Promise<MockState> {
    const requests: MockPreviewRequest[] = [];
    const previewSources = new Map<string, string>();

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
    return { requests };
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
