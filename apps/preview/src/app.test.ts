import { afterEach, describe, expect, it } from 'vitest';

import { MemoryPreviewStore } from '@wikione/preview-store';

import { buildPreviewApp } from './app.js';

const id = 'abcdefghijklmnopqrstuvwxyzABCDEF';
const createdAt = '2026-07-19T00:00:00.000Z';
const expiresAt = '2999-07-19T00:02:00.000Z';
const html = '<!doctype html><html><body><p>Rendered</p></body></html>';
const openApps: ReturnType<typeof buildPreviewApp>[] = [];

afterEach(async () => {
    await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('isolated preview origin', () => {
    it('serves an opaque bundle with isolation and no credential headers', async () => {
        const store = new MemoryPreviewStore();
        await store.put(
            id,
            {
                html,
                wikiBaseUrl: 'https://en.wikipedia.org',
                createdAt,
                expiresAt,
            },
            120_000,
        );
        const app = createTestApp(store);
        const response = await app.inject({
            method: 'GET',
            url: `/previews/${id}`,
            headers: {
                authorization: 'Bearer ignored-by-design',
                cookie: 'ignored-by-design=true',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toBe(html);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.headers['cross-origin-resource-policy']).toBe(
            'cross-origin',
        );
        expect(response.headers['content-security-policy']).toContain(
            "default-src 'none'",
        );
        expect(response.headers['content-security-policy']).toContain(
            "script-src 'unsafe-inline' 'unsafe-eval' https://en.wikipedia.org",
        );
        expect(response.headers['content-security-policy']).toContain(
            'frame-ancestors http://127.0.0.1:5173',
        );
        expect(response.headers['permissions-policy']).toContain('camera=()');
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers['www-authenticate']).toBeUndefined();
    });

    it('uses indistinguishable 404 responses for malformed and absent IDs', async () => {
        const app = createTestApp(new MemoryPreviewStore());
        const malformed = await app.inject({
            method: 'GET',
            url: '/previews/guessable-1',
        });
        const absent = await app.inject({
            method: 'GET',
            url: `/previews/${id}`,
        });

        expect(malformed.statusCode).toBe(404);
        expect(absent.statusCode).toBe(404);
        expect(malformed.body).toBe(absent.body);
        expect(malformed.headers['cache-control']).toContain('no-store');
    });

    it('refuses a bundle whose document expiry has passed', async () => {
        const store = new MemoryPreviewStore();
        await store.put(
            id,
            {
                html,
                wikiBaseUrl: 'https://en.wikipedia.org',
                createdAt: '2020-01-01T00:00:00.000Z',
                expiresAt: '2020-01-01T00:02:00.000Z',
            },
            120_000,
        );
        const app = createTestApp(store);
        const response = await app.inject({
            method: 'GET',
            url: `/previews/${id}`,
        });

        expect(response.statusCode).toBe(404);
        expect(response.body).not.toContain('Rendered');
    });

    it('does not expose source, authentication, or publishing routes', async () => {
        const app = createTestApp(new MemoryPreviewStore());
        const responses = await Promise.all([
            app.inject({ method: 'POST', url: '/previews' }),
            app.inject({ method: 'GET', url: '/v1/pages/source' }),
            app.inject({ method: 'GET', url: '/v1/auth/availability' }),
            app.inject({ method: 'POST', url: '/v1/publish' }),
        ]);

        expect(responses.map((response) => response.statusCode)).toEqual([
            404, 404, 404, 404,
        ]);
    });

    it('rejects non-origin frame configuration', () => {
        expect(() =>
            buildPreviewApp({
                editorOrigins: ['https://editor.example/path'],
            }),
        ).toThrow('exact HTTPS origins');
    });
});

function createTestApp(store: MemoryPreviewStore) {
    const app = buildPreviewApp({
        editorOrigins: ['http://127.0.0.1:5173'],
        previewStore: store,
    });
    openApps.push(app);
    return app;
}
