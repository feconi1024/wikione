/**
 * Reusable OpenAPI-compatible JSON Schema fragments for the public API.
 *
 * Fastify uses these schemas for both validation metadata and the document
 * emitted by @fastify/swagger. Keep route-specific descriptions beside their
 * handlers; keep shapes shared by multiple routes here.
 */

const requestIdHeader = {
    type: 'string',
    description:
        'Optional caller-supplied correlation ID. The service returns it in error bodies.',
    maxLength: 200,
} as const;

export const commonRequestHeadersSchema = {
    type: 'object',
    properties: {
        'x-request-id': requestIdHeader,
    },
} as const;

export const mutationHeadersSchema = {
    type: 'object',
    properties: {
        origin: {
            type: 'string',
            format: 'uri',
            description:
                'Required: exact configured WikiOne editor origin. The handler returns origin-not-allowed when it is absent or invalid.',
        },
        'x-wikione-csrf': {
            type: 'string',
            pattern: '^[A-Za-z0-9_-]{43}$',
            description:
                'Required: CSRF token from the current authenticated session response.',
        },
        'x-request-id': requestIdHeader,
    },
} as const;

const apiError = {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'message'],
    properties: {
        code: { type: 'string', minLength: 1, maxLength: 100 },
        message: { type: 'string', minLength: 1, maxLength: 2_000 },
        requestId: { type: 'string', minLength: 1, maxLength: 200 },
    },
} as const;

const currentRevision = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'timestamp'],
    properties: {
        id: { type: 'integer', minimum: 1 },
        timestamp: { type: 'string', format: 'date-time' },
    },
} as const;

const wikimediaConnection = {
    type: 'object',
    additionalProperties: false,
    required: ['connected', 'reason', 'message'],
    properties: {
        connected: { type: 'boolean', const: false },
        reason: { type: 'string', const: 'oauth-registration-pending' },
        message: { type: 'string', minLength: 1, maxLength: 500 },
    },
} as const;

const accountIdentity = {
    type: 'object',
    additionalProperties: false,
    required: ['provider', 'accountId', 'username', 'displayName', 'createdAt'],
    properties: {
        provider: { type: 'string', const: 'wikione' },
        accountId: { type: 'string', format: 'uuid' },
        username: {
            type: 'string',
            minLength: 3,
            maxLength: 40,
            pattern: '^[\\p{L}\\p{N}][\\p{L}\\p{N}_.-]*$',
        },
        displayName: { type: 'string', minLength: 1, maxLength: 80 },
        createdAt: { type: 'string', format: 'date-time' },
    },
} as const;

const authenticatedSession = {
    type: 'object',
    additionalProperties: false,
    required: [
        'authenticated',
        'account',
        'csrfToken',
        'expiresAt',
        'absoluteExpiresAt',
        'wikimedia',
    ],
    properties: {
        authenticated: { type: 'boolean', const: true },
        account: accountIdentity,
        csrfToken: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
        expiresAt: { type: 'string', format: 'date-time' },
        absoluteExpiresAt: { type: 'string', format: 'date-time' },
        wikimedia: wikimediaConnection,
    },
} as const;

const sessionStatus = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            required: ['authenticated', 'wikimedia'],
            properties: {
                authenticated: { type: 'boolean', const: false },
                wikimedia: wikimediaConnection,
            },
        },
        authenticatedSession,
    ],
} as const;

const authenticationSuccess = {
    type: 'object',
    additionalProperties: false,
    required: ['session'],
    properties: { session: authenticatedSession },
} as const;

const pageSourceRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['wikiId', 'title'],
    properties: {
        wikiId: { type: 'string', pattern: '^[a-z0-9-]{2,40}$' },
        title: { type: 'string', minLength: 1, maxLength: 512 },
    },
} as const;

const pageSource = {
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
        wikiId: { type: 'string', pattern: '^[a-z0-9-]{2,40}$' },
        title: { type: 'string', minLength: 1, maxLength: 512 },
        exists: { type: 'boolean' },
        contentModel: { type: 'string', const: 'wikitext' },
        source: { type: 'string', maxLength: 2_000_000 },
        baseRevision: currentRevision,
        fetchedAt: { type: 'string', format: 'date-time' },
    },
} as const;

const previewRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['wikiId', 'title', 'source', 'contentModel', 'clientRevision'],
    properties: {
        wikiId: { type: 'string', pattern: '^[a-z0-9-]{2,40}$' },
        title: { type: 'string', minLength: 1, maxLength: 512 },
        source: { type: 'string', maxLength: 500_000 },
        contentModel: { type: 'string', const: 'wikitext' },
        clientRevision: { type: 'integer', minimum: 0 },
    },
} as const;

const previewResult = {
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
        clientRevision: { type: 'integer', minimum: 0 },
        renderUrl: { type: 'string', format: 'uri' },
        warnings: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['severity', 'message'],
                properties: {
                    severity: { type: 'string', enum: ['warning', 'error'] },
                    code: { type: 'string', minLength: 1, maxLength: 100 },
                    message: { type: 'string', minLength: 1, maxLength: 2_000 },
                },
            },
        },
        generatedAt: { type: 'string', format: 'date-time' },
        expiresAt: { type: 'string', format: 'date-time' },
    },
} as const;

const revisionCheckRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['wikiId', 'title'],
    properties: {
        wikiId: { type: 'string', pattern: '^[a-z0-9-]{2,40}$' },
        title: { type: 'string', minLength: 1, maxLength: 512 },
        baseRevisionId: { type: 'integer', minimum: 1 },
    },
} as const;

const revisionCheckResult = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'exists', 'currentRevision'],
            properties: {
                status: { type: 'string', const: 'unchanged' },
                exists: { type: 'boolean', const: true },
                currentRevision,
            },
        },
        {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'exists', 'currentRevision', 'latestSource'],
            properties: {
                status: { type: 'string', enum: ['changed', 'created'] },
                exists: { type: 'boolean', const: true },
                currentRevision,
                latestSource: { type: 'string', maxLength: 2_000_000 },
            },
        },
        {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'exists'],
            properties: {
                status: { type: 'string', const: 'missing' },
                exists: { type: 'boolean', const: false },
            },
        },
    ],
} as const;

const publishRequest = {
    type: 'object',
    additionalProperties: false,
    required: [
        'wikiId',
        'title',
        'source',
        'baseSource',
        'editingStartedAt',
        'summary',
        'minor',
        'watchlist',
    ],
    properties: {
        wikiId: { type: 'string', pattern: '^[a-z0-9-]{2,40}$' },
        title: { type: 'string', minLength: 1, maxLength: 512 },
        source: { type: 'string', maxLength: 500_000 },
        baseSource: { type: 'string', maxLength: 500_000 },
        baseRevisionId: { type: 'integer', minimum: 1 },
        baseTimestamp: { type: 'string', format: 'date-time' },
        editingStartedAt: { type: 'string', format: 'date-time' },
        summary: { type: 'string', minLength: 1, maxLength: 500 },
        minor: { type: 'boolean' },
        watchlist: {
            type: 'string',
            enum: ['preferences', 'watch', 'unwatch', 'nochange'],
        },
    },
    description:
        'baseRevisionId and baseTimestamp must either both be present or both be omitted.',
} as const;

const publishPreparationResult = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'operation'],
            properties: {
                status: { type: 'string', const: 'ready' },
                operation: { type: 'string', enum: ['create', 'update'] },
                latestRevision: currentRevision,
            },
        },
        {
            type: 'object',
            additionalProperties: false,
            required: ['status', 'reason', 'latestSource'],
            properties: {
                status: { type: 'string', const: 'conflict' },
                reason: {
                    type: 'string',
                    enum: ['revision-changed', 'page-created', 'page-deleted'],
                },
                latestRevision: currentRevision,
                latestSource: { type: 'string', maxLength: 2_000_000 },
            },
        },
    ],
} as const;

const registrationRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['username', 'displayName', 'password'],
    properties: {
        username: accountIdentity.properties.username,
        displayName: accountIdentity.properties.displayName,
        password: {
            type: 'string',
            minLength: 12,
            maxLength: 128,
            writeOnly: true,
        },
    },
} as const;

const loginRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['username', 'password'],
    properties: {
        username: accountIdentity.properties.username,
        password: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
            writeOnly: true,
        },
    },
} as const;

const accountUpdateRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['displayName'],
    properties: { displayName: accountIdentity.properties.displayName },
} as const;

const passwordChangeRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['currentPassword', 'newPassword'],
    properties: {
        currentPassword: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
            writeOnly: true,
        },
        newPassword: {
            type: 'string',
            minLength: 12,
            maxLength: 128,
            writeOnly: true,
        },
    },
} as const;

const accountDeletionRequest = {
    type: 'object',
    additionalProperties: false,
    required: ['password', 'confirmation'],
    properties: {
        password: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
            writeOnly: true,
        },
        confirmation: { type: 'string', const: 'DELETE' },
    },
} as const;

const noContent = {
    description: 'The operation completed without a response body.',
} as const;
const errorResponse = (description: string) => ({ description, ...apiError });

export const openApiSchemas = {
    apiError,
    pageSourceRequest,
    pageSource,
    previewRequest,
    previewResult,
    revisionCheckRequest,
    revisionCheckResult,
    publishRequest,
    publishPreparationResult,
    registrationRequest,
    loginRequest,
    accountUpdateRequest,
    passwordChangeRequest,
    accountDeletionRequest,
    sessionStatus,
    authenticationSuccess,
    commonRequestHeadersSchema,
    mutationHeadersSchema,
    noContent,
    errorResponse,
} as const;

/** Uniform normalized error responses added to all public endpoints. */
export function standardErrorResponses(): Record<number, object> {
    return {
        400: errorResponse('The request does not satisfy the API contract.'),
        413: errorResponse("The request exceeds WikiOne's 600 kB body limit."),
        429: errorResponse('The endpoint rate limit was exceeded.'),
        500: errorResponse('WikiOne could not complete the request.'),
    };
}
