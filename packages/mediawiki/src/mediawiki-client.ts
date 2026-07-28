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
    /** The number of overload retries after the initial request. */
    readonly maxRetries?: number;
    /** The initial exponential-backoff delay for overload retries. */
    readonly retryBaseMilliseconds?: number;
    /** A ceiling that prevents an upstream Retry-After value from stalling a worker. */
    readonly maxRetryDelayMilliseconds?: number;
    /** Injectable so retry tests do not wait for real time. */
    readonly sleep?: (milliseconds: number) => Promise<void>;
    /** Injectable jitter source for deterministic retry tests. */
    readonly random?: () => number;
}

interface MediaWikiErrorPayload {
    readonly code?: unknown;
    readonly info?: unknown;
    readonly text?: unknown;
    readonly lag?: unknown;
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
    readonly pages?:
        readonly PageRecord[] | Readonly<Record<string, PageRecord>>;
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
    /** A bounded server-directed delay, suitable for callers that queue work. */
    public readonly retryAfterSeconds: number | undefined;

    public constructor(
        message: string,
        code: string,
        status?: number,
        retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = 'MediaWikiApiError';
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
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
    readonly #maxRetries: number;
    readonly #retryBaseMilliseconds: number;
    readonly #maxRetryDelayMilliseconds: number;
    readonly #sleep: (milliseconds: number) => Promise<void>;
    readonly #random: () => number;

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
        this.#maxRetries = boundedInteger(
            options.maxRetries,
            2,
            0,
            5,
            'maxRetries',
        );
        this.#retryBaseMilliseconds = boundedInteger(
            options.retryBaseMilliseconds,
            500,
            1,
            60_000,
            'retryBaseMilliseconds',
        );
        this.#maxRetryDelayMilliseconds = boundedInteger(
            options.maxRetryDelayMilliseconds,
            30_000,
            1,
            60_000,
            'maxRetryDelayMilliseconds',
        );
        this.#sleep = options.sleep ?? defaultSleep;
        this.#random = options.random ?? Math.random;

        if (
            !Number.isFinite(this.#timeoutMilliseconds) ||
            this.#timeoutMilliseconds <= 0
        ) {
            throw new TypeError(
                'timeoutMilliseconds must be a positive number.',
            );
        }
        if (!Number.isFinite(this.#maxLagSeconds) || this.#maxLagSeconds < 0) {
            throw new TypeError('maxLagSeconds must be a non-negative number.');
        }
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
            redirects: '1',
            ...(input.revisionId === undefined
                ? { titles: input.title ?? '' }
                : { revids: String(input.revisionId) }),
        });
        const query = payload.query as QueryRecord | undefined;
        const page = firstRecord(query?.pages);
        const revision = firstRecord(page?.revisions);
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

        if (contentModel !== 'wikitext') {
            throw new MediaWikiApiError(
                'The requested revision is not wikitext.',
                'unsupported-content-model',
            );
        }

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
                'modulestyles',
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
        for (let attempt = 0; ; attempt += 1) {
            const response = await this.#request(body);
            const retryAfterSeconds = retryAfterSecondsFrom(
                response.headers.get('Retry-After'),
                this.#maxRetryDelayMilliseconds,
            );

            if (
                response.redirected ||
                response.type === 'opaqueredirect' ||
                (response.status >= 300 && response.status < 400)
            ) {
                throw new MediaWikiApiError(
                    'The MediaWiki API attempted an unexpected redirect.',
                    'redirect-rejected',
                    response.status,
                );
            }

            if (!response.ok) {
                const error = new MediaWikiApiError(
                    'The MediaWiki API request failed.',
                    'http-error',
                    response.status,
                    retryAfterSeconds,
                );
                if (this.#shouldRetryHttp(response.status, attempt)) {
                    await this.#delay(attempt, retryAfterSeconds);
                    continue;
                }
                throw error;
            }

            if (!isJsonContentType(response.headers.get('Content-Type'))) {
                throw new MediaWikiApiError(
                    'The MediaWiki API returned an unexpected content type.',
                    'invalid-content-type',
                    response.status,
                );
            }

            let payload: unknown;
            try {
                payload = await response.json();
            } catch {
                throw new MediaWikiApiError(
                    'The MediaWiki API returned invalid JSON.',
                    'invalid-json',
                    response.status,
                );
            }
            if (!isRecord(payload)) {
                throw new MediaWikiApiError(
                    'The MediaWiki API returned an invalid JSON envelope.',
                    'invalid-payload',
                    response.status,
                );
            }

            const error = apiErrorFrom(payload);
            if (error) {
                const apiError = new MediaWikiApiError(
                    'The MediaWiki API rejected the request.',
                    error.code,
                    response.status,
                    retryAfterSeconds,
                );
                if (error.code === 'maxlag' && attempt < this.#maxRetries) {
                    await this.#delay(attempt, retryAfterSeconds);
                    continue;
                }
                throw apiError;
            }

            return payload;
        }
    }

    async #request(body: URLSearchParams): Promise<Response> {
        const signal = AbortSignal.timeout(this.#timeoutMilliseconds);
        try {
            return await this.#fetch(this.#apiUrl, {
                method: 'POST',
                headers: {
                    'Api-User-Agent': this.#userAgent,
                    'Content-Type':
                        'application/x-www-form-urlencoded;charset=UTF-8',
                    'User-Agent': this.#userAgent,
                },
                body,
                redirect: 'error',
                signal,
            });
        } catch {
            if (signal.aborted) {
                throw new MediaWikiApiError(
                    'The MediaWiki API request timed out.',
                    'request-timeout',
                );
            }
            throw new MediaWikiApiError(
                'The MediaWiki API request could not be completed.',
                'request-failed',
            );
        }
    }

    #shouldRetryHttp(status: number, attempt: number): boolean {
        return attempt < this.#maxRetries && (status === 429 || status === 503);
    }

    async #delay(
        attempt: number,
        retryAfterSeconds: number | undefined,
    ): Promise<void> {
        const retryAfterMilliseconds =
            retryAfterSeconds === undefined
                ? undefined
                : retryAfterSeconds * 1_000;
        const exponential = Math.min(
            this.#maxRetryDelayMilliseconds,
            this.#retryBaseMilliseconds * 2 ** attempt,
        );
        const jitter = 0.5 + Math.min(1, Math.max(0, this.#random()));
        const delay = Math.min(
            this.#maxRetryDelayMilliseconds,
            retryAfterMilliseconds ?? Math.round(exponential * jitter),
        );
        await this.#sleep(delay);
    }
}

function boundedInteger(
    value: number | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
    name: string,
): number {
    if (value === undefined) {
        return fallback;
    }
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new TypeError(
            `${name} must be an integer between ${String(minimum)} and ${String(maximum)}.`,
        );
    }
    return value;
}

function defaultSleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterSecondsFrom(
    value: string | null,
    maximumDelayMilliseconds: number,
): number | undefined {
    if (!value) {
        return undefined;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
        return Math.min(
            Math.floor(numeric),
            Math.floor(maximumDelayMilliseconds / 1_000),
        );
    }
    const date = Date.parse(value);
    if (!Number.isNaN(date)) {
        return Math.min(
            Math.max(0, Math.ceil((date - Date.now()) / 1_000)),
            Math.floor(maximumDelayMilliseconds / 1_000),
        );
    }
    return undefined;
}

function isJsonContentType(value: string | null): boolean {
    return (
        value !== null &&
        /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(value)
    );
}

function apiErrorFrom(
    payload: Readonly<Record<string, unknown>>,
): { code: string } | undefined {
    const error = payload.error ?? firstUnknownRecord(payload.errors);
    if (!isRecord(error)) {
        return undefined;
    }
    return {
        code: safeErrorCode(error.code),
    };
}

function firstUnknownRecord(
    value: unknown,
): Readonly<Record<string, unknown>> | undefined {
    if (Array.isArray(value)) {
        const entries: readonly unknown[] = value;
        const first = entries[0];
        return isRecord(first) ? first : undefined;
    }
    if (isRecord(value)) {
        const first = Object.values(value)[0];
        return isRecord(first) ? first : undefined;
    }
    return undefined;
}

function safeErrorCode(value: unknown): string {
    if (typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/i.test(value)) {
        return value.toLowerCase();
    }
    return 'mediawiki-error';
}

function firstRecord<T extends object>(
    value: readonly T[] | Readonly<Record<string, T>> | undefined,
): T | undefined {
    if (Array.isArray(value)) {
        const entries: readonly T[] = value;
        return entries[0];
    }
    if (isRecord(value)) {
        const entries: readonly T[] = Object.values(value);
        return entries[0];
    }
    return undefined;
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
