import type {
    ParsedPreview,
    ParseWarning,
    RevisionSource,
    SiteInformation,
} from './types.js';

export interface MediaWikiClientOptions {
    readonly apiUrl: string;
    readonly userAgent: string;
    readonly fetchImplementation?: typeof fetch;
    readonly timeoutMilliseconds?: number;
    readonly maxLagSeconds?: number;
}

interface MediaWikiErrorPayload {
    readonly code?: unknown;
    readonly info?: unknown;
    readonly text?: unknown;
}

interface MediaWikiEnvelope {
    readonly error?: MediaWikiErrorPayload;
    readonly errors?: readonly MediaWikiErrorPayload[];
    readonly query?: unknown;
    readonly parse?: unknown;
}

interface RevisionRecord {
    readonly revid?: unknown;
    readonly timestamp?: unknown;
    readonly slots?: {
        readonly main?: {
            readonly content?: unknown;
            readonly contentmodel?: unknown;
        };
    };
}

interface PageRecord {
    readonly pageid?: unknown;
    readonly title?: unknown;
    readonly contentmodel?: unknown;
    readonly revisions?: readonly RevisionRecord[];
}

interface QueryRecord {
    readonly pages?: readonly PageRecord[];
    readonly general?: {
        readonly sitename?: unknown;
        readonly lang?: unknown;
        readonly rtl?: unknown;
        readonly articlepath?: unknown;
        readonly scriptpath?: unknown;
    };
}

interface ParseRecord {
    readonly title?: unknown;
    readonly pageid?: unknown;
    readonly revid?: unknown;
    readonly text?: unknown;
    readonly headhtml?: unknown;
    readonly displaytitle?: unknown;
    readonly subtitle?: unknown;
    readonly indicators?: unknown;
    readonly categorieshtml?: unknown;
    readonly modules?: unknown;
    readonly modulestyles?: unknown;
    readonly jsconfigvars?: unknown;
    readonly parsewarnings?: unknown;
}

export class MediaWikiApiError extends Error {
    public readonly code: string;
    public readonly status: number | undefined;

    public constructor(message: string, code: string, status?: number) {
        super(message);
        this.name = 'MediaWikiApiError';
        this.code = code;
        this.status = status;
    }
}

/**
 * Minimal Action API client used by the rendering spike and future provider.
 * It deliberately has no logging hooks so source text cannot be logged by
 * accident at this layer.
 */
export class MediaWikiClient {
    readonly #apiUrl: URL;
    readonly #userAgent: string;
    readonly #fetch: typeof fetch;
    readonly #timeoutMilliseconds: number;
    readonly #maxLagSeconds: number;

    public constructor(options: MediaWikiClientOptions) {
        const apiUrl = new URL(options.apiUrl);
        if (apiUrl.protocol !== 'https:') {
            throw new TypeError('MediaWiki API URLs must use HTTPS.');
        }
        if (
            apiUrl.username ||
            apiUrl.password ||
            apiUrl.hash ||
            apiUrl.search
        ) {
            throw new TypeError(
                'MediaWiki API URLs cannot include credentials, queries, or fragments.',
            );
        }
        if (!options.userAgent.trim()) {
            throw new TypeError('A descriptive User-Agent is required.');
        }

        this.#apiUrl = apiUrl;
        this.#userAgent = options.userAgent;
        this.#fetch = options.fetchImplementation ?? globalThis.fetch;
        this.#timeoutMilliseconds = options.timeoutMilliseconds ?? 15_000;
        this.#maxLagSeconds = options.maxLagSeconds ?? 5;
    }

    public async getRevisionSource(input: {
        readonly title?: string;
        readonly revisionId?: number;
    }): Promise<RevisionSource> {
        if (!input.title && !input.revisionId) {
            throw new TypeError('A title or revision ID is required.');
        }

        const payload = await this.#post({
            action: 'query',
            prop: 'revisions',
            rvprop: 'ids|timestamp|content',
            rvslots: 'main',
            ...(input.revisionId === undefined
                ? { titles: input.title ?? '' }
                : { revids: String(input.revisionId) }),
        });
        const query = payload.query as QueryRecord | undefined;
        const page = query?.pages?.[0];
        const revision = page?.revisions?.[0];
        const mainSlot = revision?.slots?.main;

        if (
            typeof page?.pageid !== 'number' ||
            typeof page.title !== 'string' ||
            typeof revision?.revid !== 'number' ||
            typeof revision.timestamp !== 'string' ||
            typeof mainSlot?.content !== 'string'
        ) {
            throw new MediaWikiApiError(
                'The requested revision was not found.',
                'missing-revision',
            );
        }

        const contentModel =
            typeof mainSlot.contentmodel === 'string'
                ? mainSlot.contentmodel
                : typeof page.contentmodel === 'string'
                  ? page.contentmodel
                  : 'unknown';

        return {
            pageId: page.pageid,
            revisionId: revision.revid,
            timestamp: revision.timestamp,
            title: page.title,
            contentModel,
            source: mainSlot.content,
        };
    }

    public async getSiteInformation(): Promise<SiteInformation> {
        const payload = await this.#post({
            action: 'query',
            meta: 'siteinfo',
            siprop: 'general',
        });
        const query = payload.query as QueryRecord | undefined;
        const general = query?.general;

        if (
            typeof general?.sitename !== 'string' ||
            typeof general.lang !== 'string' ||
            typeof general.articlepath !== 'string' ||
            typeof general.scriptpath !== 'string'
        ) {
            throw new MediaWikiApiError(
                'The wiki returned incomplete site information.',
                'bad-siteinfo',
            );
        }

        return {
            siteName: general.sitename,
            languageCode: general.lang,
            direction: general.rtl === true ? 'rtl' : 'ltr',
            articlePath: general.articlepath,
            scriptPath: general.scriptpath,
        };
    }

    public async parsePreview(input: {
        readonly title: string;
        readonly source: string;
        readonly revisionId?: number;
        readonly skin?: 'vector-2022' | 'vector' | 'minerva';
    }): Promise<ParsedPreview> {
        const payload = await this.#post({
            action: 'parse',
            title: input.title,
            text: input.source,
            contentmodel: 'wikitext',
            preview: '1',
            usearticle: '1',
            useskin: input.skin ?? 'vector-2022',
            disableeditsection: '1',
            disablelimitreport: '1',
            prop: [
                'text',
                'headhtml',
                'displaytitle',
                'subtitle',
                'indicators',
                'categorieshtml',
                'modules',
                'jsconfigvars',
                'parsewarnings',
            ].join('|'),
            ...(input.revisionId === undefined
                ? {}
                : { revid: String(input.revisionId) }),
        });
        const parsed = payload.parse as ParseRecord | undefined;

        if (
            typeof parsed?.title !== 'string' ||
            typeof parsed.text !== 'string'
        ) {
            throw new MediaWikiApiError(
                'The wiki returned incomplete parser output.',
                'bad-parse',
            );
        }

        return {
            title: parsed.title,
            ...(typeof parsed.pageid === 'number'
                ? { pageId: parsed.pageid }
                : {}),
            ...(typeof parsed.revid === 'number'
                ? { revisionId: parsed.revid }
                : {}),
            text: parsed.text,
            headHtml:
                typeof parsed.headhtml === 'string' ? parsed.headhtml : '',
            displayTitle:
                typeof parsed.displaytitle === 'string'
                    ? parsed.displaytitle
                    : parsed.title,
            subtitle:
                typeof parsed.subtitle === 'string' ? parsed.subtitle : '',
            indicators: toStringArray(parsed.indicators),
            categoriesHtml:
                typeof parsed.categorieshtml === 'string'
                    ? parsed.categorieshtml
                    : '',
            modules: toStringArray(parsed.modules),
            moduleStyles: toStringArray(parsed.modulestyles),
            javascriptConfig: isRecord(parsed.jsconfigvars)
                ? parsed.jsconfigvars
                : {},
            warnings: toWarnings(parsed.parsewarnings),
        };
    }

    async #post(
        parameters: Readonly<Record<string, string>>,
    ): Promise<MediaWikiEnvelope> {
        const body = new URLSearchParams({
            format: 'json',
            formatversion: '2',
            errorformat: 'plaintext',
            maxlag: String(this.#maxLagSeconds),
            ...parameters,
        });
        const response = await this.#fetch(this.#apiUrl, {
            method: 'POST',
            headers: {
                'Api-User-Agent': this.#userAgent,
                'Content-Type':
                    'application/x-www-form-urlencoded;charset=UTF-8',
                'User-Agent': this.#userAgent,
            },
            body,
            redirect: 'error',
            signal: AbortSignal.timeout(this.#timeoutMilliseconds),
        });

        if (!response.ok) {
            throw new MediaWikiApiError(
                `The MediaWiki API returned HTTP ${String(response.status)}.`,
                'http-error',
                response.status,
            );
        }

        const payload = (await response.json()) as MediaWikiEnvelope;
        const error = payload.error ?? payload.errors?.[0];
        if (error) {
            const message =
                typeof error.info === 'string'
                    ? error.info
                    : typeof error.text === 'string'
                      ? error.text
                      : 'The MediaWiki API rejected the request.';
            const code =
                typeof error.code === 'string' ? error.code : 'mediawiki-error';
            throw new MediaWikiApiError(message, code);
        }

        return payload;
    }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): readonly string[] {
    if (Array.isArray(value)) {
        return value.filter(
            (entry): entry is string => typeof entry === 'string',
        );
    }
    if (isRecord(value)) {
        return Object.values(value).filter(
            (entry): entry is string => typeof entry === 'string',
        );
    }
    return [];
}

function toWarnings(value: unknown): readonly ParseWarning[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((warning): readonly ParseWarning[] => {
        if (typeof warning === 'string') {
            return [{ message: warning }];
        }
        if (!isRecord(warning)) {
            return [];
        }
        const message =
            typeof warning.text === 'string'
                ? warning.text
                : typeof warning.message === 'string'
                  ? warning.message
                  : undefined;
        if (!message) {
            return [];
        }
        return [
            {
                ...(typeof warning.code === 'string'
                    ? { code: warning.code }
                    : {}),
                message,
            },
        ];
    });
}
