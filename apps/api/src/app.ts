import { randomBytes } from 'node:crypto';

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import Fastify, {
    LogController,
    type FastifyInstance,
    type FastifyReply,
    type FastifyRequest,
} from 'fastify';

import {
    pageSourceRequestSchema,
    pageSourceSchema,
    previewRequestSchema,
    previewResultSchema,
    type ApiError,
    type PageSource,
    type PreviewResult,
    type WikiDescriptor,
} from '@wikione/contracts';
import {
    MediaWikiApiError,
    MediaWikiClient,
    type ParsedPreview,
    type RevisionSource,
} from '@wikione/mediawiki';
import { createPreviewDocument } from '@wikione/preview-document';
import { MemoryPreviewStore, type PreviewStore } from '@wikione/preview-store';

import { findSupportedWiki, supportedWikis } from './wiki-registry.js';

const defaultPreviewTtlMilliseconds = 120_000;
const defaultPreviewBaseUrl = 'http://127.0.0.1:4174';
const defaultEditorOrigins = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
] as const;
const defaultUserAgent =
    'WikiOne/0.1 (https://github.com/feconi1024/wikione; preview service)';

export interface MediaWikiClientPort {
    readonly getRevisionSource: (input: {
        readonly title?: string;
        readonly revisionId?: number;
    }) => Promise<RevisionSource>;
    readonly parsePreview: (input: {
        readonly title: string;
        readonly source: string;
        readonly revisionId?: number;
        readonly skin?: 'vector-2022' | 'vector' | 'minerva';
    }) => Promise<ParsedPreview>;
}

export type MediaWikiClientFactory = (
    wiki: WikiDescriptor,
) => MediaWikiClientPort;

export interface BuildApiOptions {
    readonly logger?: boolean;
    readonly previewStore?: PreviewStore;
    readonly previewBaseUrl?: string;
    readonly previewTtlMilliseconds?: number;
    readonly editorOrigins?: readonly string[];
    readonly mediaWikiClientFactory?: MediaWikiClientFactory;
    readonly mediaWikiUserAgent?: string;
    readonly now?: () => number;
    readonly randomId?: () => string;
}

/** Creates the API without opening a socket so tests can use Fastify injection. */
export async function buildApi(
    options: BuildApiOptions = {},
): Promise<FastifyInstance> {
    const previewStore = options.previewStore ?? new MemoryPreviewStore();
    const previewBaseUrl = normalizeServiceBaseUrl(
        options.previewBaseUrl ?? defaultPreviewBaseUrl,
    );
    const editorOrigins = normalizeOrigins(
        options.editorOrigins ?? defaultEditorOrigins,
    );
    const ttlMilliseconds = readPreviewTtl(
        options.previewTtlMilliseconds ?? defaultPreviewTtlMilliseconds,
    );
    const now = options.now ?? Date.now;
    const randomId = options.randomId ?? createPreviewId;
    const mediaWikiClientFactory =
        options.mediaWikiClientFactory ??
        createDefaultMediaWikiClientFactory(
            options.mediaWikiUserAgent ?? defaultUserAgent,
        );
    const app = Fastify({
        bodyLimit: 600_000,
        logController: new LogController({ disableRequestLogging: true }),
        logger: options.logger ?? false,
        requestIdHeader: 'x-request-id',
        trustProxy: false,
    });

    await app.register(swagger, {
        openapi: {
            openapi: '3.1.0',
            info: {
                title: 'WikiOne API',
                description:
                    'Source loading and preview compilation for the WikiOne editor.',
                version: '0.1.0',
            },
            tags: [
                { name: 'meta', description: 'Service metadata and health.' },
                {
                    name: 'editor',
                    description: 'Read-only editor and preview operations.',
                },
                {
                    name: 'authentication',
                    description: 'Authentication capability status.',
                },
            ],
        },
    });
    await app.register(cors, {
        credentials: false,
        methods: ['GET', 'POST', 'OPTIONS'],
        origin: [...editorOrigins],
        strictPreflight: true,
    });
    await app.register(rateLimit, {
        global: false,
        hook: 'preHandler',
    });

    app.addHook('onSend', async (_request, reply) => {
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Referrer-Policy', 'no-referrer');
    });
    app.addHook('onClose', async () => {
        await previewStore.close();
    });
    app.setErrorHandler(async (error, request, reply) => {
        const statusCode = normalizeStatusCode(readErrorStatusCode(error));
        const code =
            statusCode === 400
                ? 'invalid-request'
                : statusCode === 413
                  ? 'request-too-large'
                  : statusCode === 429
                    ? 'rate-limit-exceeded'
                    : 'internal-error';
        if (statusCode >= 500) {
            request.log.error(
                { code, requestId: request.id },
                'Request failed safely.',
            );
        }
        await sendError(
            reply,
            statusCode,
            code,
            statusCode === 413
                ? "The request exceeds WikiOne's size limit."
                : statusCode === 400
                  ? 'The request does not match the documented API contract.'
                  : statusCode === 429
                    ? 'Too many requests. Please wait before trying again.'
                    : 'WikiOne could not complete the request.',
            request,
        );
    });

    app.get(
        '/healthz',
        {
            schema: {
                tags: ['meta'],
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['status'],
                        properties: {
                            status: { type: 'string', const: 'ok' },
                        },
                    },
                },
            },
        },
        () => ({ status: 'ok' as const }),
    );

    app.get(
        '/v1/meta/contracts',
        {
            schema: {
                tags: ['meta'],
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['apiVersion', 'contractPackage'],
                        properties: {
                            apiVersion: { type: 'string' },
                            contractPackage: { type: 'string' },
                        },
                    },
                },
            },
        },
        () => ({
            apiVersion: 'v1',
            contractPackage: '@wikione/contracts@0.1.0',
        }),
    );

    app.get(
        '/v1/wikis',
        {
            schema: {
                tags: ['editor'],
                response: {
                    200: {
                        type: 'array',
                        items: wikiDescriptorJsonSchema,
                    },
                },
            },
        },
        async (_request, reply) => {
            reply.header('Cache-Control', 'public, max-age=300');
            return supportedWikis;
        },
    );

    app.post(
        '/v1/pages/source',
        {
            schema: {
                tags: ['editor'],
                body: pageSourceRequestJsonSchema,
                response: {
                    200: pageSourceJsonSchema,
                    400: apiErrorJsonSchema,
                    422: apiErrorJsonSchema,
                    502: apiErrorJsonSchema,
                },
            },
        },
        async (request, reply) => {
            const parsedRequest = pageSourceRequestSchema.safeParse(
                request.body,
            );
            if (!parsedRequest.success) {
                return sendError(
                    reply,
                    400,
                    'invalid-request',
                    'A supported wiki and non-empty page title are required.',
                    request,
                );
            }
            const wiki = findSupportedWiki(parsedRequest.data.wikiId);
            if (!wiki) {
                return sendUnsupportedWiki(reply, request);
            }

            try {
                const revision = await mediaWikiClientFactory(
                    wiki,
                ).getRevisionSource({ title: parsedRequest.data.title });
                if (revision.contentModel !== 'wikitext') {
                    return sendError(
                        reply,
                        422,
                        'unsupported-content-model',
                        'Milestone 1 can edit only wikitext pages.',
                        request,
                    );
                }
                const result: PageSource = pageSourceSchema.parse({
                    wikiId: wiki.id,
                    title: revision.title,
                    exists: true,
                    contentModel: 'wikitext',
                    source: revision.source,
                    baseRevision: {
                        id: revision.revisionId,
                        timestamp: revision.timestamp,
                    },
                    fetchedAt: new Date(now()).toISOString(),
                });
                reply.header('Cache-Control', 'no-store');
                return result;
            } catch (error: unknown) {
                if (
                    error instanceof MediaWikiApiError &&
                    error.code === 'missing-revision'
                ) {
                    const result: PageSource = pageSourceSchema.parse({
                        wikiId: wiki.id,
                        title: parsedRequest.data.title,
                        exists: false,
                        contentModel: 'wikitext',
                        source: '',
                        fetchedAt: new Date(now()).toISOString(),
                    });
                    reply.header('Cache-Control', 'no-store');
                    return result;
                }
                return sendUpstreamError(reply, request);
            }
        },
    );

    app.post(
        '/v1/previews',
        {
            config: {
                rateLimit: {
                    max: 30,
                    timeWindow: '1 minute',
                },
            },
            schema: {
                tags: ['editor'],
                body: previewRequestJsonSchema,
                response: {
                    200: previewResultJsonSchema,
                    400: apiErrorJsonSchema,
                    502: apiErrorJsonSchema,
                },
            },
        },
        async (request, reply) => {
            const parsedRequest = previewRequestSchema.safeParse(request.body);
            if (!parsedRequest.success) {
                return sendError(
                    reply,
                    400,
                    'invalid-request',
                    'A valid, size-bounded wikitext preview request is required.',
                    request,
                );
            }
            const wiki = findSupportedWiki(parsedRequest.data.wikiId);
            if (!wiki) {
                return sendUnsupportedWiki(reply, request);
            }

            try {
                const parsed = await mediaWikiClientFactory(wiki).parsePreview({
                    title: parsedRequest.data.title,
                    source: parsedRequest.data.source,
                    skin: 'vector-2022',
                });
                const createdAt = new Date(now());
                const expiresAt = new Date(
                    createdAt.getTime() + ttlMilliseconds,
                );
                const id = randomId();
                const html = createPreviewDocument({
                    wikiBaseUrl: wiki.baseUrl,
                    siteName: wiki.displayName,
                    languageCode: wiki.languageCode,
                    direction: wiki.direction,
                    parsed,
                });
                await previewStore.put(
                    id,
                    {
                        html,
                        wikiBaseUrl: wiki.baseUrl,
                        createdAt: createdAt.toISOString(),
                        expiresAt: expiresAt.toISOString(),
                    },
                    ttlMilliseconds,
                );
                const result: PreviewResult = previewResultSchema.parse({
                    clientRevision: parsedRequest.data.clientRevision,
                    renderUrl: new URL(
                        `previews/${id}`,
                        previewBaseUrl,
                    ).toString(),
                    warnings: parsed.warnings.map((warning) => ({
                        severity: 'warning' as const,
                        ...(warning.code
                            ? { code: warning.code.slice(0, 100) }
                            : {}),
                        message: warning.message.slice(0, 2_000),
                    })),
                    generatedAt: createdAt.toISOString(),
                    expiresAt: expiresAt.toISOString(),
                });
                reply.header('Cache-Control', 'no-store');
                return result;
            } catch {
                return sendUpstreamError(reply, request);
            }
        },
    );

    app.get(
        '/v1/auth/availability',
        {
            schema: {
                tags: ['authentication'],
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['available', 'reason', 'message'],
                        properties: {
                            available: { type: 'boolean', const: false },
                            reason: {
                                type: 'string',
                                const: 'oauth-registration-pending',
                            },
                            message: { type: 'string' },
                        },
                    },
                },
            },
        },
        async (_request, reply) => {
            reply.header('Cache-Control', 'no-store');
            return {
                available: false,
                reason: 'oauth-registration-pending',
                message:
                    'Sign-in and publishing are unavailable until OAuth registration is complete.',
            } as const;
        },
    );

    app.get(
        '/openapi.json',
        { schema: { hide: true } },
        async (_request, reply) => {
            await reply.type('application/json').send(app.swagger());
        },
    );

    return app;
}

function createDefaultMediaWikiClientFactory(
    userAgent: string,
): MediaWikiClientFactory {
    if (!userAgent.trim()) {
        throw new TypeError('A MediaWiki User-Agent is required.');
    }
    return (wiki) =>
        new MediaWikiClient({
            apiUrl: wiki.apiUrl,
            userAgent,
        });
}

function createPreviewId(): string {
    return randomBytes(24).toString('base64url');
}

async function sendUnsupportedWiki(
    reply: FastifyReply,
    request: FastifyRequest,
): Promise<ApiError> {
    return sendError(
        reply,
        400,
        'unsupported-wiki',
        'The requested wiki is not enabled for this WikiOne deployment.',
        request,
    );
}

async function sendUpstreamError(
    reply: FastifyReply,
    request: FastifyRequest,
): Promise<ApiError> {
    return sendError(
        reply,
        502,
        'mediawiki-unavailable',
        'The wiki could not process the request. Please retry shortly.',
        request,
    );
}

async function sendError(
    reply: FastifyReply,
    statusCode: number,
    code: string,
    message: string,
    request: FastifyRequest,
): Promise<ApiError> {
    const payload: ApiError = {
        code,
        message,
        requestId: request.id,
    };
    await reply.status(statusCode).send(payload);
    return payload;
}

function readPreviewTtl(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > 600_000) {
        throw new RangeError(
            'Preview TTL must be a positive integer no greater than ten minutes.',
        );
    }
    return value;
}

function normalizeServiceBaseUrl(value: string): URL {
    const url = new URL(value);
    if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== 'https:' &&
            !(url.protocol === 'http:' && isLoopbackHost(url.hostname)))
    ) {
        throw new TypeError(
            'Preview base URL must be HTTPS, or loopback HTTP for local development.',
        );
    }
    url.pathname = url.pathname.endsWith('/')
        ? url.pathname
        : `${url.pathname}/`;
    return url;
}

function normalizeOrigins(values: readonly string[]): readonly string[] {
    if (values.length === 0) {
        throw new TypeError('At least one editor origin is required.');
    }
    return values.map((value) => {
        const url = new URL(value);
        if (
            url.origin !== value ||
            (url.protocol !== 'https:' &&
                !(url.protocol === 'http:' && isLoopbackHost(url.hostname)))
        ) {
            throw new TypeError(
                'Editor origins must be exact HTTPS origins, or loopback HTTP origins for local development.',
            );
        }
        return url.origin;
    });
}

function isLoopbackHost(hostname: string): boolean {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]'
    );
}

function normalizeStatusCode(value: number | undefined): number {
    if (value === 400 || value === 413 || value === 429) {
        return value;
    }
    return 500;
}

function readErrorStatusCode(error: unknown): number | undefined {
    if (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
    ) {
        return error.statusCode;
    }
    return undefined;
}

const apiErrorJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'message'],
    properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' },
    },
} as const;

const wikiDescriptorJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'id',
        'displayName',
        'languageCode',
        'direction',
        'baseUrl',
        'apiUrl',
    ],
    properties: {
        id: { type: 'string' },
        displayName: { type: 'string' },
        languageCode: { type: 'string' },
        direction: { type: 'string', enum: ['ltr', 'rtl'] },
        baseUrl: { type: 'string', format: 'uri' },
        apiUrl: { type: 'string', format: 'uri' },
    },
} as const;

const pageSourceRequestJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['wikiId', 'title'],
    properties: {
        wikiId: { type: 'string' },
        title: { type: 'string', minLength: 1, maxLength: 512 },
    },
} as const;

const pageSourceJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'wikiId',
        'title',
        'exists',
        'contentModel',
        'source',
        'fetchedAt',
    ],
    properties: {
        wikiId: { type: 'string' },
        title: { type: 'string' },
        exists: { type: 'boolean' },
        contentModel: { type: 'string', const: 'wikitext' },
        source: { type: 'string' },
        baseRevision: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'timestamp'],
            properties: {
                id: { type: 'integer' },
                timestamp: { type: 'string', format: 'date-time' },
            },
        },
        fetchedAt: { type: 'string', format: 'date-time' },
    },
} as const;

const previewRequestJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['wikiId', 'title', 'source', 'contentModel', 'clientRevision'],
    properties: {
        wikiId: { type: 'string' },
        title: { type: 'string', minLength: 1, maxLength: 512 },
        source: { type: 'string', maxLength: 500_000 },
        contentModel: { type: 'string', const: 'wikitext' },
        clientRevision: { type: 'integer', minimum: 0 },
    },
} as const;

const previewResultJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'clientRevision',
        'renderUrl',
        'warnings',
        'generatedAt',
        'expiresAt',
    ],
    properties: {
        clientRevision: { type: 'integer' },
        renderUrl: { type: 'string', format: 'uri' },
        warnings: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['severity', 'message'],
                properties: {
                    severity: {
                        type: 'string',
                        enum: ['warning', 'error'],
                    },
                    code: { type: 'string' },
                    message: { type: 'string' },
                },
            },
        },
        generatedAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
    },
} as const;
