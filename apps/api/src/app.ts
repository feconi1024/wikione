import { randomBytes } from 'node:crypto';

import cookie from '@fastify/cookie';
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
    AuthenticationService,
    createPasswordHasher,
    hashLookupValue,
    type SessionKeyRing,
} from '@wikione/auth-core';
import {
    MemoryAccountRepository,
    MemorySessionRepository,
} from '@wikione/auth-store';
import {
    pageSourceRequestSchema,
    pageSourceSchema,
    previewRequestSchema,
    previewResultSchema,
    publishCapabilitySchema,
    publishPreparationRequestSchema,
    publishPreparationResultSchema,
    revisionCheckRequestSchema,
    revisionCheckResultSchema,
    type ApiError,
    type PageSource,
    type PreviewResult,
    type PublishPreparationResult,
    type RevisionCheckResult,
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

import { registerAuthRoutes } from './auth-routes.js';
import { openApiSchemas, standardErrorResponses } from './openapi.js';
import type { RateLimitStoreResource } from './redis-rate-limit-store.js';
import { findSupportedWiki, supportedWikis } from './wiki-registry.js';

const defaultPreviewTtlMilliseconds = 120_000;
const defaultReadinessCheckTimeoutMilliseconds = 1_000;
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
    readonly authentication?: AuthenticationService;
    readonly logger?: boolean;
    readonly previewStore?: PreviewStore;
    readonly previewBaseUrl?: string;
    readonly previewTtlMilliseconds?: number;
    readonly editorOrigins?: readonly string[];
    readonly mediaWikiClientFactory?: MediaWikiClientFactory;
    readonly mediaWikiUserAgent?: string;
    readonly now?: () => number;
    readonly randomId?: () => string;
    readonly rateLimitStore?: RateLimitStoreResource;
    readonly readinessCheckTimeoutMilliseconds?: number;
    readonly secureCookies?: boolean;
    readonly sessionKeyRing?: SessionKeyRing;
    readonly trustProxy?: boolean | number;
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
    const readinessCheckTimeoutMilliseconds = readReadinessCheckTimeout(
        options.readinessCheckTimeoutMilliseconds ??
            defaultReadinessCheckTimeoutMilliseconds,
    );
    const now = options.now ?? Date.now;
    const randomId = options.randomId ?? createPreviewId;
    const mediaWikiClientFactory =
        options.mediaWikiClientFactory ??
        createDefaultMediaWikiClientFactory(
            options.mediaWikiUserAgent ?? defaultUserAgent,
        );
    const memoryKeyRing = options.sessionKeyRing ?? {
        activeKeyId: 'memory',
        encryptionKeys: { memory: randomBytes(32) },
        lookupHmacKey: randomBytes(32),
    };
    const authentication =
        options.authentication ??
        new AuthenticationService({
            accounts: new MemoryAccountRepository(),
            sessions: new MemorySessionRepository(memoryKeyRing, now),
            passwordHasher: createPasswordHasher(),
            now,
        });
    const app = Fastify({
        bodyLimit: 600_000,
        logController: new LogController({ disableRequestLogging: true }),
        logger: options.logger ?? false,
        requestIdHeader: 'x-request-id',
        trustProxy: options.trustProxy ?? false,
    });

    await app.register(cookie);
    await app.register(swagger, {
        openapi: {
            openapi: '3.1.0',
            info: {
                title: 'WikiOne API',
                description:
                    'Source loading and preview compilation for the WikiOne editor.',
                version: '0.1.0',
            },
            components: {
                securitySchemes: {
                    sessionCookie: {
                        type: 'apiKey',
                        in: 'cookie',
                        name: '__Host-wikione_session',
                        description:
                            'HttpOnly WikiOne session cookie. In local development its name is wikione_session_local.',
                    },
                },
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
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        origin: [...editorOrigins],
        strictPreflight: true,
    });
    await app.register(rateLimit, {
        global: false,
        hook: 'preHandler',
        keyGenerator: (request) =>
            hashLookupValue(`rate-limit:v1:${request.ip}`, memoryKeyRing),
        ...(options.rateLimitStore
            ? { store: options.rateLimitStore.store }
            : {}),
    });

    app.addHook('onSend', async (_request, reply) => {
        setApiSecurityHeaders(reply);
    });
    app.addHook('onResponse', async (request, reply) => {
        request.log.info(
            {
                durationMs: Number(reply.elapsedTime.toFixed(2)),
                event: 'request-complete',
                method: request.method,
                requestId: request.id,
                route: request.routeOptions.url,
                statusCode: reply.statusCode,
            },
            'Request completed.',
        );
    });
    app.addHook('onClose', async () => {
        await Promise.all([
            previewStore.close(),
            authentication.close(),
            options.rateLimitStore?.close(),
        ]);
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

    for (const path of ['/healthz', '/livez'] as const) {
        app.get(
            path,
            {
                schema: {
                    tags: ['meta'],
                    summary: 'Check service liveness',
                    description:
                        'Unauthenticated process liveness endpoint. It does not contact PostgreSQL, Redis, or Wikimedia.',
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
    }

    app.get(
        '/readyz',
        {
            schema: {
                tags: ['meta'],
                summary: 'Check service readiness',
                description:
                    'Checks account/session and preview-store dependencies without contacting Wikimedia.',
                response: {
                    200: readinessResponseSchema('ready'),
                    503: readinessResponseSchema('not-ready'),
                },
            },
        },
        async (request, reply) => {
            const readiness = await runReadinessChecks(
                [
                    {
                        name: 'authentication-store',
                        check: async () => authentication.ready(),
                    },
                    {
                        name: 'preview-store',
                        check: async () => previewStore.ready(),
                    },
                    ...(options.rateLimitStore
                        ? [
                              {
                                  name: 'rate-limit-store',
                                  check: async () =>
                                      options.rateLimitStore?.ready(),
                              },
                          ]
                        : []),
                ],
                readinessCheckTimeoutMilliseconds,
            );
            if (!readiness.ready) {
                request.log.warn(
                    { checks: readiness.checks, event: 'readiness-failed' },
                    'A required API dependency is unavailable.',
                );
                reply.header('Retry-After', '5').status(503);
            }
            return {
                status: readiness.ready
                    ? ('ready' as const)
                    : ('not-ready' as const),
                checks: readiness.checks,
            };
        },
    );

    app.get(
        '/v1/meta/contracts',
        {
            schema: {
                tags: ['meta'],
                summary: 'Read API contract metadata',
                description:
                    'Reports the public API version and shared contract package.',
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
                summary: 'List enabled wikis',
                description:
                    'Returns the fixed set of MediaWiki targets enabled by this deployment. The response is publicly cacheable for five minutes.',
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
                summary: 'Load a page source',
                description:
                    'Fetches the current wikitext source and base revision. A missing page is represented as exists=false with an empty source.',
                headers: openApiSchemas.commonRequestHeadersSchema,
                body: openApiSchemas.pageSourceRequest,
                response: {
                    200: openApiSchemas.pageSource,
                    ...standardErrorResponses(),
                    422: openApiSchemas.errorResponse(
                        'The target page is not wikitext.',
                    ),
                    502: openApiSchemas.errorResponse(
                        'MediaWiki could not process the source request.',
                    ),
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
                summary: 'Compile a source preview',
                description:
                    'Compiles bounded wikitext through MediaWiki and returns an opaque, temporary render URL. Preview source is never published.',
                headers: openApiSchemas.commonRequestHeadersSchema,
                body: openApiSchemas.previewRequest,
                response: {
                    200: openApiSchemas.previewResult,
                    ...standardErrorResponses(),
                    502: openApiSchemas.errorResponse(
                        'MediaWiki could not compile the preview.',
                    ),
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

    app.post(
        '/v1/pages/revision-check',
        {
            attachValidation: true,
            config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
            schema: {
                tags: ['editor'],
                summary: 'Check a page revision',
                description:
                    'Compares an optional base revision with the latest wikitext revision before a publish review.',
                headers: openApiSchemas.commonRequestHeadersSchema,
                body: openApiSchemas.revisionCheckRequest,
                response: {
                    200: openApiSchemas.revisionCheckResult,
                    ...standardErrorResponses(),
                    422: openApiSchemas.errorResponse(
                        'The target page is not wikitext.',
                    ),
                    502: openApiSchemas.errorResponse(
                        'MediaWiki could not process the revision check.',
                    ),
                },
            },
        },
        async (request, reply) => {
            const parsed = revisionCheckRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                return sendError(
                    reply,
                    400,
                    'invalid-request',
                    'A supported wiki, title, and optional base revision are required.',
                    request,
                );
            }
            const wiki = findSupportedWiki(parsed.data.wikiId);
            if (!wiki) {
                return sendUnsupportedWiki(reply, request);
            }
            try {
                const revision = await mediaWikiClientFactory(
                    wiki,
                ).getRevisionSource({ title: parsed.data.title });
                if (revision.contentModel !== 'wikitext') {
                    return sendError(
                        reply,
                        422,
                        'unsupported-content-model',
                        'WikiOne can prepare only wikitext pages.',
                        request,
                    );
                }
                const result: RevisionCheckResult =
                    revisionCheckResultSchema.parse(
                        parsed.data.baseRevisionId === undefined
                            ? {
                                  status: 'created',
                                  exists: true,
                                  currentRevision: {
                                      id: revision.revisionId,
                                      timestamp: revision.timestamp,
                                  },
                                  latestSource: revision.source,
                              }
                            : parsed.data.baseRevisionId === revision.revisionId
                              ? {
                                    status: 'unchanged',
                                    exists: true,
                                    currentRevision: {
                                        id: revision.revisionId,
                                        timestamp: revision.timestamp,
                                    },
                                }
                              : {
                                    status: 'changed',
                                    exists: true,
                                    currentRevision: {
                                        id: revision.revisionId,
                                        timestamp: revision.timestamp,
                                    },
                                    latestSource: revision.source,
                                },
                    );
                reply.header('Cache-Control', 'no-store');
                return result;
            } catch (error: unknown) {
                if (isMissingRevision(error)) {
                    const result: RevisionCheckResult =
                        revisionCheckResultSchema.parse({
                            status: 'missing',
                            exists: false,
                        });
                    reply.header('Cache-Control', 'no-store');
                    return result;
                }
                return sendUpstreamError(reply, request);
            }
        },
    );

    app.get(
        '/v1/publish/capability',
        {
            schema: {
                tags: ['editor'],
                summary: 'Read publishing availability',
                description:
                    'Publishing is intentionally disabled until Wikimedia approves the public OAuth application.',
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
                            message: {
                                type: 'string',
                                minLength: 1,
                                maxLength: 500,
                            },
                        },
                    },
                    ...standardErrorResponses(),
                },
            },
        },
        async (_request, reply) => {
            reply.header('Cache-Control', 'no-store');
            return publishCapabilitySchema.parse({
                available: false,
                reason: 'oauth-registration-pending',
                message:
                    'Review and conflict preparation are available, but Wikimedia publishing awaits OAuth approval.',
            });
        },
    );

    app.post(
        '/v1/publish/prepare',
        {
            attachValidation: true,
            config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
            schema: {
                tags: ['editor'],
                summary: 'Prepare a reviewed publish',
                description:
                    'Performs a non-mutating latest-revision check and reports whether a create/update is ready or a three-way merge is required.',
                headers: openApiSchemas.commonRequestHeadersSchema,
                body: openApiSchemas.publishRequest,
                response: {
                    200: openApiSchemas.publishPreparationResult,
                    ...standardErrorResponses(),
                    422: openApiSchemas.errorResponse(
                        'The target page is not wikitext.',
                    ),
                    502: openApiSchemas.errorResponse(
                        'MediaWiki could not process the publish preparation.',
                    ),
                },
            },
        },
        async (request, reply) => {
            const parsed = publishPreparationRequestSchema.safeParse(
                request.body,
            );
            if (!parsed.success) {
                return sendError(
                    reply,
                    400,
                    'invalid-request',
                    'A bounded draft, base snapshot, edit summary, and edit options are required.',
                    request,
                );
            }
            const wiki = findSupportedWiki(parsed.data.wikiId);
            if (!wiki) {
                return sendUnsupportedWiki(reply, request);
            }
            try {
                const revision = await mediaWikiClientFactory(
                    wiki,
                ).getRevisionSource({ title: parsed.data.title });
                if (revision.contentModel !== 'wikitext') {
                    return sendError(
                        reply,
                        422,
                        'unsupported-content-model',
                        'WikiOne can prepare only wikitext pages.',
                        request,
                    );
                }
                const latestRevision = {
                    id: revision.revisionId,
                    timestamp: revision.timestamp,
                };
                const result: PublishPreparationResult =
                    publishPreparationResultSchema.parse(
                        parsed.data.baseRevisionId === undefined
                            ? {
                                  status: 'conflict',
                                  reason: 'page-created',
                                  latestRevision,
                                  latestSource: revision.source,
                              }
                            : parsed.data.baseRevisionId === revision.revisionId
                              ? {
                                    status: 'ready',
                                    operation: 'update',
                                    latestRevision,
                                }
                              : {
                                    status: 'conflict',
                                    reason: 'revision-changed',
                                    latestRevision,
                                    latestSource: revision.source,
                                },
                    );
                reply.header('Cache-Control', 'no-store');
                return result;
            } catch (error: unknown) {
                if (isMissingRevision(error)) {
                    const result: PublishPreparationResult =
                        publishPreparationResultSchema.parse(
                            parsed.data.baseRevisionId === undefined
                                ? { status: 'ready', operation: 'create' }
                                : {
                                      status: 'conflict',
                                      reason: 'page-deleted',
                                      latestSource: '',
                                  },
                        );
                    reply.header('Cache-Control', 'no-store');
                    return result;
                }
                return sendUpstreamError(reply, request);
            }
        },
    );

    app.post(
        '/v1/publish',
        {
            attachValidation: true,
            schema: {
                tags: ['editor'],
                summary: 'Submit a publish',
                description:
                    'Placeholder endpoint. It never submits an edit while public Wikimedia OAuth registration is pending.',
                headers: openApiSchemas.commonRequestHeadersSchema,
                body: openApiSchemas.publishRequest,
                response: {
                    503: openApiSchemas.errorResponse(
                        'Wikimedia OAuth registration is pending; no edit was submitted.',
                    ),
                    ...standardErrorResponses(),
                },
            },
        },
        async (request, reply) =>
            sendError(
                reply,
                503,
                'wikimedia-oauth-unavailable',
                'No edit was submitted. Wikimedia OAuth registration is pending.',
                request,
            ),
    );

    registerAuthRoutes(app, {
        authentication,
        editorOrigins,
        secureCookies: options.secureCookies ?? false,
    });

    app.get(
        '/openapi.json',
        {
            schema: {
                tags: ['meta'],
                summary: 'Get the OpenAPI description',
                description:
                    "Returns this service's generated OpenAPI 3.1 document. The repository tracks the same document at openapi/wikione.openapi.json.",
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: true,
                        required: ['openapi', 'info', 'paths'],
                        properties: {
                            openapi: { type: 'string', const: '3.1.0' },
                            info: {
                                type: 'object',
                                additionalProperties: true,
                            },
                            paths: {
                                type: 'object',
                                additionalProperties: true,
                            },
                        },
                    },
                    ...standardErrorResponses(),
                },
            },
        },
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

function isMissingRevision(error: unknown): boolean {
    return (
        error instanceof MediaWikiApiError && error.code === 'missing-revision'
    );
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

function setApiSecurityHeaders(reply: FastifyReply): void {
    if (!reply.hasHeader('Cache-Control')) {
        reply.header('Cache-Control', 'private, no-store, max-age=0');
    }
    reply.header(
        'Content-Security-Policy',
        "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-site');
    reply.header(
        'Permissions-Policy',
        'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    );
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
    );
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
}

interface ReadinessCheck {
    readonly name: string;
    readonly check: () => Promise<void>;
}

function readinessResponseSchema(status: 'ready' | 'not-ready') {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['status', 'checks'],
        properties: {
            status: { type: 'string', const: status },
            checks: {
                type: 'object',
                additionalProperties: {
                    type: 'string',
                    enum: ['ready', 'failed'],
                },
            },
        },
    } as const;
}

async function runReadinessChecks(
    checks: readonly ReadinessCheck[],
    timeoutMilliseconds: number,
): Promise<{
    readonly ready: boolean;
    readonly checks: Readonly<Record<string, 'ready' | 'failed'>>;
}> {
    const results = await Promise.all(
        checks.map(async ({ check, name }) => {
            try {
                await withTimeout(check, timeoutMilliseconds);
                return [name, 'ready'] as const;
            } catch {
                return [name, 'failed'] as const;
            }
        }),
    );
    const statuses = Object.fromEntries(results) as Readonly<
        Record<string, 'ready' | 'failed'>
    >;
    return {
        ready: Object.values(statuses).every((status) => status === 'ready'),
        checks: statuses,
    };
}

async function withTimeout(
    check: () => Promise<void>,
    timeoutMilliseconds: number,
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new Error('Readiness dependency timed out.')),
            timeoutMilliseconds,
        );
        timer.unref();
    });
    try {
        await Promise.race([check(), timeout]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

function readReadinessCheckTimeout(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > 30_000) {
        throw new RangeError(
            'Readiness check timeout must be an integer from 1 to 30000 milliseconds.',
        );
    }
    return value;
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
