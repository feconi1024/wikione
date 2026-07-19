import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaWikiApiError, type ParsedPreview } from '@wikione/mediawiki';
import { MemoryPreviewStore } from '@wikione/preview-store';

import {
    buildApi,
    type MediaWikiClientFactory,
    type MediaWikiClientPort,
} from './app.js';

const previewId = 'abcdefghijklmnopqrstuvwxyzABCDEF';
const timestamp = '2026-07-19T00:00:00.000Z';
const parsedPreview: ParsedPreview = {
    title: 'Earth',
    text: '<p><strong>Rendered Earth</strong></p>',
    headHtml: '<html lang="en" dir="ltr"><body class="mw-body"></body></html>',
    displayTitle: 'Earth',
    subtitle: '',
    indicators: [],
    categoriesHtml: '',
    modules: [],
    moduleStyles: ['ext.cite.styles'],
    javascriptConfig: {},
    warnings: [{ code: 'test-warning', message: 'A parser warning.' }],
};

const openApps: Awaited<ReturnType<typeof buildApi>>[] = [];

afterEach(async () => {
    await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('Milestone 1 API', () => {
    it('reports health and advertises every implemented OpenAPI route', async () => {
        const app = await createTestApi();

        const healthResponse = await app.inject({
            method: 'GET',
            url: '/healthz',
        });
        const livenessResponse = await app.inject({
            method: 'GET',
            url: '/livez',
        });
        const readinessResponse = await app.inject({
            method: 'GET',
            url: '/readyz',
        });
        const documentResponse = await app.inject({
            method: 'GET',
            url: '/openapi.json',
        });
        const document = documentResponse.json<{
            openapi: string;
            paths: Readonly<Record<string, unknown>>;
        }>();

        expect(healthResponse.json()).toEqual({ status: 'ok' });
        expect(livenessResponse.json()).toEqual({ status: 'ok' });
        expect(readinessResponse.json()).toEqual({
            status: 'ready',
            checks: {
                'authentication-store': 'ready',
                'preview-store': 'ready',
            },
        });
        expect(document.openapi).toBe('3.1.0');
        expect(Object.keys(document.paths)).toEqual(
            expect.arrayContaining([
                '/healthz',
                '/livez',
                '/readyz',
                '/v1/meta/contracts',
                '/v1/wikis',
                '/v1/pages/source',
                '/v1/previews',
                '/v1/auth/availability',
            ]),
        );
    });

    it('reports dependency failure without exposing the underlying error', async () => {
        const store = new MemoryPreviewStore();
        vi.spyOn(store, 'ready').mockRejectedValue(
            new Error('redis://secret.internal:6379 failed'),
        );
        const app = await createTestApi({}, undefined, store);
        const response = await app.inject({ method: 'GET', url: '/readyz' });

        expect(response.statusCode).toBe(503);
        expect(response.headers['retry-after']).toBe('5');
        expect(response.json()).toEqual({
            status: 'not-ready',
            checks: {
                'authentication-store': 'ready',
                'preview-store': 'failed',
            },
        });
        expect(response.body).not.toContain('secret.internal');
    });

    it('lists only fixed supported wiki descriptors', async () => {
        const app = await createTestApi();
        const response = await app.inject({ method: 'GET', url: '/v1/wikis' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual([
            expect.objectContaining({
                id: 'en-wikipedia',
                apiUrl: 'https://en.wikipedia.org/w/api.php',
            }),
        ]);
    });

    it('loads source and preserves the base revision for future conflicts', async () => {
        const getRevisionSource = vi.fn().mockResolvedValue({
            pageId: 9228,
            revisionId: 123,
            timestamp,
            title: 'Earth',
            contentModel: 'wikitext',
            source: 'Earth source',
        });
        const app = await createTestApi({ getRevisionSource });
        const response = await app.inject({
            method: 'POST',
            url: '/v1/pages/source',
            payload: { wikiId: 'en-wikipedia', title: 'Earth' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            wikiId: 'en-wikipedia',
            title: 'Earth',
            exists: true,
            contentModel: 'wikitext',
            source: 'Earth source',
            baseRevision: { id: 123, timestamp },
            fetchedAt: timestamp,
        });
    });

    it('represents a missing title as a new empty page', async () => {
        const getRevisionSource = vi
            .fn()
            .mockRejectedValue(
                new MediaWikiApiError('not found', 'missing-revision'),
            );
        const app = await createTestApi({ getRevisionSource });
        const response = await app.inject({
            method: 'POST',
            url: '/v1/pages/source',
            payload: { wikiId: 'en-wikipedia', title: 'New page' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            wikiId: 'en-wikipedia',
            title: 'New page',
            exists: false,
            contentModel: 'wikitext',
            source: '',
            fetchedAt: timestamp,
        });
    });

    it('rejects arbitrary wiki URLs before creating an upstream client', async () => {
        const factory = vi.fn<MediaWikiClientFactory>();
        const app = await createTestApi(undefined, factory);
        const response = await app.inject({
            method: 'POST',
            url: '/v1/pages/source',
            payload: { wikiId: 'attacker-wiki', title: 'Earth' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'unsupported-wiki' });
        expect(factory).not.toHaveBeenCalled();
    });

    it('compiles a preview into an opaque expiring bundle without echoing source or HTML', async () => {
        const store = new MemoryPreviewStore(() => Date.parse(timestamp));
        const parsePreview = vi.fn().mockResolvedValue(parsedPreview);
        const app = await createTestApi({ parsePreview }, undefined, store);
        const source = '== Earth ==\nSensitive draft text';
        const response = await app.inject({
            method: 'POST',
            url: '/v1/previews',
            payload: {
                wikiId: 'en-wikipedia',
                title: 'Earth',
                source,
                contentModel: 'wikitext',
                clientRevision: 7,
            },
        });
        const body = response.json<{
            clientRevision: number;
            renderUrl: string;
            expiresAt: string;
        }>();
        const bundle = await store.get(previewId);

        expect(response.statusCode).toBe(200);
        expect(body).toMatchObject({
            clientRevision: 7,
            renderUrl: `http://127.0.0.1:4174/previews/${previewId}`,
            expiresAt: '2026-07-19T00:02:00.000Z',
        });
        expect(response.body).not.toContain(source);
        expect(response.body).not.toContain('Rendered Earth');
        expect(bundle?.html).toContain('<strong>Rendered Earth</strong>');
        expect(bundle?.html).toContain('ext.cite.styles');
    });

    it('rejects oversized preview sources before any upstream call', async () => {
        const parsePreview = vi.fn().mockResolvedValue(parsedPreview);
        const app = await createTestApi({ parsePreview });
        const response = await app.inject({
            method: 'POST',
            url: '/v1/previews',
            payload: {
                wikiId: 'en-wikipedia',
                title: 'Earth',
                source: 'x'.repeat(500_001),
                contentModel: 'wikitext',
                clientRevision: 1,
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'invalid-request' });
        expect(parsePreview).not.toHaveBeenCalled();
    });

    it('separates available WikiOne accounts from unavailable Wikimedia OAuth', async () => {
        const app = await createTestApi();
        const response = await app.inject({
            method: 'GET',
            url: '/v1/auth/availability',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            firstParty: { available: true, provider: 'wikione' },
            wikimedia: {
                available: false,
                reason: 'oauth-registration-pending',
                message:
                    'WikiOne accounts are available. Wikimedia connection awaits public OAuth approval.',
            },
        });
        expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('allows the configured editor origin but not arbitrary origins', async () => {
        const app = await createTestApi();
        const allowed = await app.inject({
            method: 'OPTIONS',
            url: '/v1/previews',
            headers: {
                origin: 'http://127.0.0.1:5173',
                'access-control-request-method': 'POST',
            },
        });
        const denied = await app.inject({
            method: 'OPTIONS',
            url: '/v1/previews',
            headers: {
                origin: 'https://attacker.example',
                'access-control-request-method': 'POST',
            },
        });

        expect(allowed.headers['access-control-allow-origin']).toBe(
            'http://127.0.0.1:5173',
        );
        expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('checks unchanged and changed revisions without a write request', async () => {
        const getRevisionSource = vi.fn().mockResolvedValue({
            pageId: 9228,
            revisionId: 124,
            timestamp,
            title: 'Earth',
            contentModel: 'wikitext',
            source: 'Latest source',
        });
        const app = await createTestApi({ getRevisionSource });
        const unchanged = await app.inject({
            method: 'POST',
            url: '/v1/pages/revision-check',
            payload: {
                wikiId: 'en-wikipedia',
                title: 'Earth',
                baseRevisionId: 124,
            },
        });
        const changed = await app.inject({
            method: 'POST',
            url: '/v1/pages/revision-check',
            payload: {
                wikiId: 'en-wikipedia',
                title: 'Earth',
                baseRevisionId: 123,
            },
        });

        expect(unchanged.json()).toMatchObject({
            status: 'unchanged',
            currentRevision: { id: 124 },
        });
        expect(changed.json()).toMatchObject({
            status: 'changed',
            latestSource: 'Latest source',
        });
    });

    it('classifies safe create/update and every concurrent page conflict', async () => {
        const missing = vi
            .fn()
            .mockRejectedValue(
                new MediaWikiApiError('not found', 'missing-revision'),
            );
        const missingApp = await createTestApi({ getRevisionSource: missing });
        const safeCreate = await missingApp.inject({
            method: 'POST',
            url: '/v1/publish/prepare',
            payload: preparationPayload(),
        });
        const pageDeleted = await missingApp.inject({
            method: 'POST',
            url: '/v1/publish/prepare',
            payload: preparationPayload({
                baseRevisionId: 123,
                baseTimestamp: timestamp,
            }),
        });

        const currentApp = await createTestApi();
        const pageCreated = await currentApp.inject({
            method: 'POST',
            url: '/v1/publish/prepare',
            payload: preparationPayload(),
        });
        const safeUpdate = await currentApp.inject({
            method: 'POST',
            url: '/v1/publish/prepare',
            payload: preparationPayload({
                baseRevisionId: 123,
                baseTimestamp: timestamp,
            }),
        });
        const revisionChanged = await currentApp.inject({
            method: 'POST',
            url: '/v1/publish/prepare',
            payload: preparationPayload({
                baseRevisionId: 122,
                baseTimestamp: timestamp,
            }),
        });

        expect(safeCreate.json()).toMatchObject({
            status: 'ready',
            operation: 'create',
        });
        expect(pageDeleted.json()).toMatchObject({
            status: 'conflict',
            reason: 'page-deleted',
        });
        expect(pageCreated.json()).toMatchObject({
            status: 'conflict',
            reason: 'page-created',
        });
        expect(safeUpdate.json()).toMatchObject({
            status: 'ready',
            operation: 'update',
        });
        expect(revisionChanged.json()).toMatchObject({
            status: 'conflict',
            reason: 'revision-changed',
        });
    });

    it('advertises the approval gate and cannot submit an edit', async () => {
        const getRevisionSource = vi.fn();
        const app = await createTestApi({ getRevisionSource });
        const capability = await app.inject({
            method: 'GET',
            url: '/v1/publish/capability',
        });
        const publish = await app.inject({
            method: 'POST',
            url: '/v1/publish',
            payload: preparationPayload(),
        });

        expect(capability.json()).toMatchObject({
            available: false,
            reason: 'oauth-registration-pending',
        });
        expect(publish.statusCode).toBe(503);
        expect(publish.json()).toMatchObject({
            code: 'wikimedia-oauth-unavailable',
        });
        expect(getRevisionSource).not.toHaveBeenCalled();
    });
});

function preparationPayload(
    revision: {
        readonly baseRevisionId?: number;
        readonly baseTimestamp?: string;
    } = {},
) {
    return {
        wikiId: 'en-wikipedia',
        title: 'Earth',
        source: 'Proposed source',
        baseSource: revision.baseRevisionId ? 'Earth source' : '',
        ...revision,
        editingStartedAt: timestamp,
        summary: 'Improve the page',
        minor: false,
        watchlist: 'preferences',
    };
}

async function createTestApi(
    overrides: Partial<MediaWikiClientPort> = {},
    factory?: MediaWikiClientFactory,
    previewStore?: MemoryPreviewStore,
): Promise<Awaited<ReturnType<typeof buildApi>>> {
    const client: MediaWikiClientPort = {
        getRevisionSource: vi.fn().mockResolvedValue({
            pageId: 9228,
            revisionId: 123,
            timestamp,
            title: 'Earth',
            contentModel: 'wikitext',
            source: 'Earth source',
        }),
        parsePreview: vi.fn().mockResolvedValue(parsedPreview),
        ...overrides,
    };
    const app = await buildApi({
        editorOrigins: ['http://127.0.0.1:5173'],
        mediaWikiClientFactory: factory ?? (() => client),
        now: () => Date.parse(timestamp),
        ...(previewStore ? { previewStore } : {}),
        randomId: () => previewId,
    });
    openApps.push(app);
    return app;
}
