import { afterEach, describe, expect, it } from 'vitest';

import { buildApi } from '../../apps/api/src/app.js';
import { buildPreviewApp } from '../../apps/preview/src/app.js';
import { MemoryPreviewStore } from '../../packages/preview-store/src/index.js';

const origin = 'http://127.0.0.1:5173';
const previewId = 'abcdefghijklmnopqrstuvwxyzABCDEF';
const openApps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
    await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('public-beta application security gate', () => {
    it('applies non-HTML security defaults to API responses', async () => {
        const app = await createApi();
        for (const url of [
            '/healthz',
            '/v1/auth/availability',
            '/openapi.json',
            '/not-found',
        ]) {
            const response = await app.inject({ method: 'GET', url });
            expect(response.headers['cache-control']).toContain('no-store');
            expect(response.headers['content-security-policy']).toContain(
                "default-src 'none'",
            );
            expect(response.headers['content-security-policy']).toContain(
                "frame-ancestors 'none'",
            );
            expect(response.headers['permissions-policy']).toContain(
                'camera=()',
            );
            expect(response.headers['referrer-policy']).toBe('no-referrer');
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBe('DENY');
            expect(response.headers['strict-transport-security']).toContain(
                'max-age=',
            );
            expect(response.headers['cross-origin-opener-policy']).toBe(
                'same-origin',
            );
            expect(response.headers['cross-origin-resource-policy']).toBe(
                'same-site',
            );
            expect(response.headers['x-xss-protection']).toBe('0');
        }

        const publicMetadata = await app.inject({
            method: 'GET',
            url: '/v1/wikis',
        });
        expect(publicMetadata.headers['cache-control']).toBe(
            'public, max-age=300',
        );
    });

    it('allows only the exact credentialed editor origin', async () => {
        const app = await createApi();
        const allowed = await app.inject({
            method: 'OPTIONS',
            url: '/v1/auth/login',
            headers: {
                origin,
                'access-control-request-method': 'POST',
            },
        });
        const hostile = await app.inject({
            method: 'OPTIONS',
            url: '/v1/auth/login',
            headers: {
                origin: 'https://attacker.example',
                'access-control-request-method': 'POST',
            },
        });

        expect(allowed.headers['access-control-allow-origin']).toBe(origin);
        expect(allowed.headers['access-control-allow-credentials']).toBe(
            'true',
        );
        expect(hostile.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects oversized source bodies before route processing', async () => {
        const app = await createApi();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/previews',
            headers: {
                'content-type': 'application/json',
                origin,
            },
            payload: JSON.stringify({
                wikiId: 'en-wikipedia',
                title: 'Sandbox',
                source: 'x'.repeat(610_000),
                contentModel: 'wikitext',
                clientRevision: 1,
            }),
        });

        expect(response.statusCode).toBe(413);
        expect(parseJsonBody(response)).toMatchObject({
            code: 'request-too-large',
        });
        expect(response.body).not.toContain('x'.repeat(100));
    });

    it('keeps OAuth and publishing endpoints inert without redirects', async () => {
        const app = await createApi();
        const [oauth, publish] = await Promise.all([
            app.inject({
                method: 'GET',
                url: '/v1/auth/wikimedia/start?returnTo=https://attacker.example',
            }),
            app.inject({
                method: 'POST',
                url: '/v1/publish',
                payload: {},
            }),
        ]);

        for (const response of [oauth, publish]) {
            expect(response.statusCode).toBe(503);
            expect(response.headers.location).toBeUndefined();
            expect(parseJsonBody(response)).toMatchObject({
                code: 'wikimedia-oauth-unavailable',
            });
        }
    });

    it('serves hostile preview markup only inside the cookie-free isolated policy', async () => {
        const store = new MemoryPreviewStore();
        await store.put(
            previewId,
            {
                html: '<!doctype html><script>parent.postMessage(document.cookie, "*")</script>',
                wikiBaseUrl: 'https://en.wikipedia.org',
                createdAt: '2026-07-19T00:00:00.000Z',
                expiresAt: '2999-07-19T00:02:00.000Z',
            },
            120_000,
        );
        const app = buildPreviewApp({
            editorOrigins: [origin],
            previewStore: store,
        });
        openApps.push(app);
        const response = await app.inject({
            method: 'GET',
            url: `/previews/${previewId}`,
            headers: {
                authorization: 'Bearer must-be-ignored',
                cookie: 'must-not-be-used=true',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.headers['cross-origin-resource-policy']).toBe(
            'cross-origin',
        );
        expect(response.headers['content-security-policy']).toContain(
            `frame-ancestors ${origin}`,
        );
        expect(response.headers['permissions-policy']).toContain('camera=()');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(response.headers['strict-transport-security']).toContain(
            'max-age=',
        );
        expect(response.headers['x-xss-protection']).toBe('0');
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers['www-authenticate']).toBeUndefined();
    });
});

async function createApi(): Promise<Awaited<ReturnType<typeof buildApi>>> {
    const app = await buildApi({ editorOrigins: [origin] });
    openApps.push(app);
    return app;
}

function parseJsonBody(response: { readonly body: string }): unknown {
    return JSON.parse(response.body) as unknown;
}
