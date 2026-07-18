import {
    pageSourceSchema,
    previewResultSchema,
    type PageSource,
    type PreviewRequest,
    type PreviewResult,
    type WikiDescriptor,
    wikiDescriptorSchema,
} from '@wikione/contracts';

const defaultApiBaseUrl = 'http://127.0.0.1:3000';

export class WikiOneApiClient {
    readonly #baseUrl: URL;

    public constructor(
        baseUrl = import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl,
    ) {
        this.#baseUrl = new URL(ensureTrailingSlash(baseUrl));
    }

    public async listWikis(signal?: AbortSignal): Promise<WikiDescriptor[]> {
        const payload = await this.#request(
            'v1/wikis',
            signal ? { signal } : {},
        );
        return wikiDescriptorSchema.array().parse(payload);
    }

    public async loadPage(
        wikiId: string,
        title: string,
        signal?: AbortSignal,
    ): Promise<PageSource> {
        const payload = await this.#request('v1/pages/source', {
            method: 'POST',
            body: JSON.stringify({ wikiId, title }),
            ...(signal ? { signal } : {}),
        });
        return pageSourceSchema.parse(payload);
    }

    public async compilePreview(
        request: PreviewRequest,
        signal: AbortSignal,
    ): Promise<PreviewResult> {
        const payload = await this.#request('v1/previews', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
        return previewResultSchema.parse(payload);
    }

    async #request(path: string, init: RequestInit): Promise<unknown> {
        const response = await fetch(new URL(path, this.#baseUrl), {
            ...init,
            headers: {
                Accept: 'application/json',
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            },
            credentials: 'omit',
            redirect: 'error',
        });
        const payload = (await response.json().catch(() => undefined)) as
            Readonly<Record<string, unknown>> | undefined;
        if (!response.ok) {
            const message =
                typeof payload?.message === 'string'
                    ? payload.message
                    : `WikiOne API returned HTTP ${String(response.status)}.`;
            throw new Error(message.slice(0, 500));
        }
        return payload;
    }
}

function ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
}
