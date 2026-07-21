import { afterEach, describe, expect, it, vi } from 'vitest';

import { WikiOneApiClient } from './api.js';

const runtimeGlobal = globalThis as typeof globalThis & {
    __WIKIONE_RUNTIME_CONFIG__?: { readonly apiBaseUrl?: string };
};

afterEach(() => {
    delete runtimeGlobal.__WIKIONE_RUNTIME_CONFIG__;
    vi.unstubAllGlobals();
});

describe('WikiOne API runtime origin', () => {
    it('uses the container-provided API origin without rebuilding the web app', async () => {
        runtimeGlobal.__WIKIONE_RUNTIME_CONFIG__ = Object.freeze({
            apiBaseUrl: 'https://api.wikione.example',
        });
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify([
                    {
                        apiUrl: 'https://en.wikipedia.org/w/api.php',
                        baseUrl: 'https://en.wikipedia.org',
                        direction: 'ltr',
                        displayName: 'English Wikipedia',
                        id: 'en-wikipedia',
                        languageCode: 'en',
                    },
                ]),
                {
                    headers: { 'Content-Type': 'application/json' },
                    status: 200,
                },
            ),
        );
        vi.stubGlobal('fetch', fetchMock);

        await new WikiOneApiClient().listWikis();

        expect(fetchMock).toHaveBeenCalledWith(
            new URL('https://api.wikione.example/v1/wikis'),
            expect.objectContaining({ credentials: 'include' }),
        );
    });
});
