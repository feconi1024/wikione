import { describe, expect, it, vi } from 'vitest';

import { MediaWikiClient } from './mediawiki-client.js';
import type { MediaWikiApiError } from './mediawiki-client.js';

function response(
    payload: unknown,
    status = 200,
    contentType = 'application/json',
): Response {
    return new Response(JSON.stringify(payload), {
        status,
        ...(contentType ? { headers: { 'Content-Type': contentType } } : {}),
    });
}

function revisionPayload(contentModel = 'wikitext'): object {
    return {
        query: {
            pages: [
                {
                    pageid: 12,
                    title: 'Earth',
                    contentmodel: contentModel,
                    revisions: [
                        {
                            revid: 42,
                            timestamp: '2026-07-17T00:00:00Z',
                            slots: {
                                main: {
                                    contentmodel: contentModel,
                                    content: 'Hello [[Earth]]',
                                },
                            },
                        },
                    ],
                },
            ],
        },
    };
}

function client(
    fetchImplementation: typeof fetch,
    options: Partial<ConstructorParameters<typeof MediaWikiClient>[0]> = {},
): MediaWikiClient {
    return new MediaWikiClient({
        apiUrl: 'https://en.wikipedia.org/w/api.php',
        userAgent: 'WikiOne-Test/0.0 (https://example.invalid)',
        fetchImplementation,
        ...options,
    });
}

describe('MediaWikiClient', () => {
    it('rejects insecure and credential-bearing API endpoints', () => {
        expect(
            () =>
                new MediaWikiClient({
                    apiUrl: 'http://en.wikipedia.org/w/api.php',
                    userAgent: 'WikiOne-Test/0.0',
                }),
        ).toThrow('HTTPS');
        expect(
            () =>
                new MediaWikiClient({
                    apiUrl: 'https://user@example.org/w/api.php?format=json',
                    userAgent: 'WikiOne-Test/0.0',
                }),
        ).toThrow('credentials, queries, or fragments');
    });

    it('validates bounded retry controls', () => {
        const fetchImplementation = vi.fn<typeof fetch>();
        expect(() => client(fetchImplementation, { maxRetries: 6 })).toThrow(
            'maxRetries',
        );
        expect(() =>
            client(fetchImplementation, { retryBaseMilliseconds: 0 }),
        ).toThrow('retryBaseMilliseconds');
        expect(() =>
            client(fetchImplementation, { maxRetryDelayMilliseconds: 0 }),
        ).toThrow('maxRetryDelayMilliseconds');
        expect(() =>
            client(fetchImplementation, { maxRetries: 0 }),
        ).not.toThrow();
    });

    it('loads pinned wikitext revisions and follows title redirects', async () => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(response(revisionPayload()));

        const revision = await client(fetchImplementation).getRevisionSource({
            title: 'Earth',
        });

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
        expect(requestBody.get('titles')).toBe('Earth');
        expect(requestBody.get('redirects')).toBe('1');
        expect(requestBody.get('maxlag')).toBe('5');
    });

    it('accepts the legacy page-record map shape', async () => {
        const payload = revisionPayload() as {
            query: { pages: readonly unknown[] };
        };
        const page = payload.query.pages[0];
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(response({ query: { pages: { '12': page } } }));

        await expect(
            client(fetchImplementation).getRevisionSource({ revisionId: 42 }),
        ).resolves.toMatchObject({ pageId: 12, revisionId: 42 });
    });

    it('rejects missing and non-wikitext revisions without returning source', async () => {
        const missing = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                response({ query: { pages: [{ title: 'Missing' }] } }),
            );
        await expect(
            client(missing).getRevisionSource({ title: 'Missing' }),
        ).rejects.toMatchObject({ code: 'missing-revision' });

        const nonWikitext = vi
            .fn<typeof fetch>()
            .mockResolvedValue(response(revisionPayload('Scribunto')));
        await expect(
            client(nonWikitext).getRevisionSource({ revisionId: 42 }),
        ).rejects.toMatchObject({ code: 'unsupported-content-model' });
    });

    it('normalizes parser module and warning array and record variants', async () => {
        const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
            response({
                parse: {
                    title: 'Sandbox',
                    text: '<div class="mw-parser-output"><p>Hello</p></div>',
                    modules: { a: 'ext.cite.ux-enhancements' },
                    modulestyles: ['ext.cite.styles'],
                    jsconfigvars: { wgPageName: 'Sandbox' },
                    parsewarnings: [
                        { code: 'example', text: 'Example warning' },
                    ],
                },
            }),
        );

        const parsed = await client(fetchImplementation).parsePreview({
            title: 'Sandbox',
            source: 'Hello',
        });

        expect(parsed.modules).toEqual(['ext.cite.ux-enhancements']);
        expect(parsed.moduleStyles).toEqual(['ext.cite.styles']);
        expect(parsed.warnings).toEqual([
            { code: 'example', message: 'Example warning' },
        ]);
    });

    it('uses generic, structured errors for legacy and formatversion-2 error envelopes', async () => {
        const legacy = vi.fn<typeof fetch>().mockResolvedValue(
            response({
                error: { code: 'invalidtitle', info: 'secret source body' },
            }),
        );
        await expect(client(legacy).getSiteInformation()).rejects.toMatchObject(
            {
                code: 'invalidtitle',
                message: 'The MediaWiki API rejected the request.',
            } satisfies Partial<MediaWikiApiError>,
        );

        const modern = vi.fn<typeof fetch>().mockResolvedValue(
            response({
                errors: [{ code: 'readonly', text: 'do not expose me' }],
            }),
        );
        await expect(client(modern).getSiteInformation()).rejects.toMatchObject(
            {
                code: 'readonly',
                message: 'The MediaWiki API rejected the request.',
            } satisfies Partial<MediaWikiApiError>,
        );
    });

    it('rejects redirect, missing-content-type, malformed JSON, and invalid envelopes safely', async () => {
        const redirected = response({}, 200);
        Object.defineProperty(redirected, 'redirected', { value: true });
        await expect(
            client(
                vi.fn<typeof fetch>().mockResolvedValue(redirected),
            ).getSiteInformation(),
        ).rejects.toMatchObject({ code: 'redirect-rejected' });

        await expect(
            client(
                vi.fn<typeof fetch>().mockResolvedValue(response({}, 200, '')),
            ).getSiteInformation(),
        ).rejects.toMatchObject({ code: 'invalid-content-type' });

        await expect(
            client(
                vi
                    .fn<typeof fetch>()
                    .mockResolvedValue(response({}, 200, 'text/html')),
            ).getSiteInformation(),
        ).rejects.toMatchObject({ code: 'invalid-content-type' });

        await expect(
            client(
                vi.fn<typeof fetch>().mockResolvedValue(
                    new Response('{not json', {
                        headers: { 'Content-Type': 'application/json' },
                    }),
                ),
            ).getSiteInformation(),
        ).rejects.toMatchObject({ code: 'invalid-json' });

        await expect(
            client(
                vi
                    .fn<typeof fetch>()
                    .mockResolvedValue(response(['not-an-envelope'])),
            ).getSiteInformation(),
        ).rejects.toMatchObject({ code: 'invalid-payload' });
    });

    it.each([429, 503])(
        'retries HTTP %i only within the configured bound',
        async (status) => {
            const fetchImplementation = vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(response({}, status, 'text/plain'))
                .mockResolvedValueOnce(
                    response({
                        query: {
                            general: {
                                sitename: 'Wikipedia',
                                lang: 'en',
                                articlepath: '/wiki/$1',
                                scriptpath: '/w',
                            },
                        },
                    }),
                );
            const sleeps: number[] = [];

            await expect(
                client(fetchImplementation, {
                    sleep: (milliseconds) => {
                        sleeps.push(milliseconds);
                        return Promise.resolve();
                    },
                    random: () => 0,
                }).getSiteInformation(),
            ).resolves.toMatchObject({ siteName: 'Wikipedia' });
            expect(fetchImplementation).toHaveBeenCalledTimes(2);
            expect(sleeps).toEqual([250]);
        },
    );

    it('retries maxlag envelopes and exposes bounded Retry-After seconds', async () => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                response(
                    { errors: [{ code: 'maxlag', text: 'not exposed' }] },
                    200,
                ),
            )
            .mockResolvedValueOnce(
                response({
                    query: {
                        general: {
                            sitename: 'Wikipedia',
                            lang: 'en',
                            articlepath: '/wiki/$1',
                            scriptpath: '/w',
                        },
                    },
                }),
            );
        const sleeps: number[] = [];

        await client(fetchImplementation, {
            sleep: (milliseconds) => {
                sleeps.push(milliseconds);
                return Promise.resolve();
            },
            random: () => 1,
        }).getSiteInformation();
        expect(sleeps).toEqual([750]);

        const overloaded = vi.fn<typeof fetch>().mockResolvedValue(
            new Response('{}', {
                status: 429,
                headers: { 'Retry-After': '999999' },
            }),
        );
        await expect(
            client(overloaded, { maxRetries: 0 }).getSiteInformation(),
        ).rejects.toMatchObject({
            code: 'http-error',
            status: 429,
            retryAfterSeconds: 30,
        } satisfies Partial<MediaWikiApiError>);
        expect(overloaded).toHaveBeenCalledTimes(1);
    });

    it('does not retry arbitrary HTTP 4xx responses', async () => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockResolvedValue(response({}, 400));
        const sleep = vi.fn(() => Promise.resolve());

        await expect(
            client(fetchImplementation, { sleep }).getSiteInformation(),
        ).rejects.toMatchObject({ code: 'http-error', status: 400 });
        expect(fetchImplementation).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('normalizes timeout failures without retrying', async () => {
        const fetchImplementation = vi
            .fn<typeof fetch>()
            .mockImplementation(async (_input, init) => {
                await new Promise((resolve) => setTimeout(resolve, 20));
                if ((init?.signal as AbortSignal | null)?.aborted) {
                    throw new DOMException('timed out', 'AbortError');
                }
                return response({});
            });

        await expect(
            client(fetchImplementation, {
                timeoutMilliseconds: 1,
            }).getSiteInformation(),
        ).rejects.toMatchObject({ code: 'request-timeout' });
        expect(fetchImplementation).toHaveBeenCalledTimes(1);
    });
});
