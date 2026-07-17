import { afterEach, describe, expect, it } from 'vitest';

import { buildApi } from './app.js';

const openApps: Awaited<ReturnType<typeof buildApi>>[] = [];

afterEach(async () => {
    await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('API foundation', () => {
    it('reports service health without leaking environment data', async () => {
        const app = await buildApi();
        openApps.push(app);

        const response = await app.inject({ method: 'GET', url: '/healthz' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
    });

    it('publishes an OpenAPI 3.1 document', async () => {
        const app = await buildApi();
        openApps.push(app);

        const response = await app.inject({
            method: 'GET',
            url: '/openapi.json',
        });
        const document = response.json<{
            openapi: string;
            paths: Readonly<Record<string, unknown>>;
        }>();

        expect(response.statusCode).toBe(200);
        expect(document.openapi).toBe('3.1.0');
        expect(document.paths).toHaveProperty('/healthz');
        expect(document.paths).toHaveProperty('/v1/meta/contracts');
    });
});
