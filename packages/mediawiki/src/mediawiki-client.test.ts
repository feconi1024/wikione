import { describe, expect, it, vi } from 'vitest';

import { MediaWikiClient } from './mediawiki-client.js';
import type { MediaWikiApiError } from './mediawiki-client.js';

function response(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('MediaWikiClient', () => {
    it('rejects insecure API endpoints', () => {
        expect(
            () =>
                new MediaWikiClient({
                    apiUrl: 'http://en.wikipedia.org/w/api.php',
                    userAgent: 'WikiOne-Test/0.0',
                }),
        ).toThrow('HTTPS');
    });

    it('loads pinned wikitext revisions without logging source', async () => {
        const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
            response({
                query: {
                    pages: [
                        {
                            pageid: 12,
                            title: 'Earth',
                            contentmodel: 'wikitext',
                            revisions: [
                                {
                                    revid: 42,
                                    timestamp: '2026-07-17T00:00:00Z',
                                    slots: {
                                        main: {
                                            contentmodel: 'wikitext',
                                            content: 'Hello [[Earth]]',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            }),
        );
        const client = new MediaWikiClient({
            apiUrl: 'https://en.wikipedia.org/w/api.php',
            userAgent: 'WikiOne-Test/0.0 (https://example.invalid)',
            fetchImplementation,
        });

        const revision = await client.getRevisionSource({ revisionId: 42 });

        expect(revision.source).toBe('Hello [[Earth]]');
        const request = fetchImplementation.mock.calls[0];
        expect(request?.[1]?.headers).toMatchObject({
            'Api-User-Agent': 'WikiOne-Test/0.0 (https://example.invalid)',
        });
        const requestBody = request?.[1]?.body;
        expect(requestBody).toBeInstanceOf(URLSearchParams);
        if (!(requestBody instanceof URLSearchParams)) {
            throw new TypeError('Expected a URLSearchParams request body.');
        }
        expect(requestBody.toString()).toContain('revids=42');
        expect(requestBody.toString()).toContain('maxlag=5');
    });

    it('normalizes parser modules and warnings', async () => {
        const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
            response({
                parse: {
                    title: 'Sandbox',
                    text: '<div class="mw-parser-output"><p>Hello</p></div>',
                    headhtml:
                        '<!doctype html><html lang="en" dir="ltr"><head></head><body>',
                    displaytitle: 'Sandbox',
                    modules: ['ext.cite.ux-enhancements'],
                    modulestyles: ['ext.cite.styles'],
                    jsconfigvars: { wgPageName: 'Sandbox' },
                    parsewarnings: [
                        { code: 'example', text: 'Example warning' },
                    ],
                },
            }),
        );
        const client = new MediaWikiClient({
            apiUrl: 'https://en.wikipedia.org/w/api.php',
            userAgent: 'WikiOne-Test/0.0',
            fetchImplementation,
        });

        const parsed = await client.parsePreview({
            title: 'Sandbox',
            source: 'Hello',
        });

        expect(parsed.moduleStyles).toContain('ext.cite.styles');
        const requestBody = fetchImplementation.mock.calls[0]?.[1]?.body;
        expect(requestBody).toBeInstanceOf(URLSearchParams);
        expect((requestBody as URLSearchParams).get('prop')).toContain(
            'modulestyles',
        );
        expect(parsed.javascriptConfig).toMatchObject({
            wgPageName: 'Sandbox',
        });
        expect(parsed.warnings).toEqual([
            { code: 'example', message: 'Example warning' },
        ]);
    });

    it('returns structured upstream errors', async () => {
        const client = new MediaWikiClient({
            apiUrl: 'https://en.wikipedia.org/w/api.php',
            userAgent: 'WikiOne-Test/0.0',
            fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
                response({
                    error: {
                        code: 'maxlag',
                        info: 'Waiting for replicas.',
                    },
                }),
            ),
        });

        await expect(client.getSiteInformation()).rejects.toMatchObject({
            code: 'maxlag',
            message: 'Waiting for replicas.',
        } satisfies Partial<MediaWikiApiError>);
    });
});
