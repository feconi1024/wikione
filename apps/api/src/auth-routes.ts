import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
    AuthenticationError,
    type AccountRecord,
    type AuthenticationService,
    type IssuedSession,
    type SessionPayload,
} from '@wikione/auth-core';
import {
    accountDeletionRequestSchema,
    accountUpdateRequestSchema,
    loginRequestSchema,
    passwordChangeRequestSchema,
    registrationRequestSchema,
    type ApiError,
    type SessionStatus,
} from '@wikione/contracts';

import { openApiSchemas, standardErrorResponses } from './openapi.js';

const wikimediaUnavailable = {
    connected: false,
    reason: 'oauth-registration-pending',
    message: 'Wikimedia connection and publishing await public OAuth approval.',
} as const;

export interface AuthRouteOptions {
    readonly authentication: AuthenticationService;
    readonly editorOrigins: readonly string[];
    readonly secureCookies: boolean;
}

/** Registers first-party routes and inert Wikimedia OAuth placeholders. */
export function registerAuthRoutes(
    app: FastifyInstance,
    options: AuthRouteOptions,
): void {
    const cookieName = options.secureCookies
        ? '__Host-wikione_session'
        : 'wikione_session_local';

    app.get(
        '/v1/auth/availability',
        {
            schema: {
                tags: ['authentication'],
                summary: 'Read authentication availability',
                description:
                    'First-party WikiOne accounts are available. Wikimedia account connection remains a non-operational public OAuth placeholder.',
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['firstParty', 'wikimedia'],
                        properties: {
                            firstParty: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['available', 'provider'],
                                properties: {
                                    available: { type: 'boolean', const: true },
                                    provider: {
                                        type: 'string',
                                        const: 'wikione',
                                    },
                                },
                            },
                            wikimedia: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['available', 'reason', 'message'],
                                properties: {
                                    available: {
                                        type: 'boolean',
                                        const: false,
                                    },
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
                        },
                    },
                    ...standardErrorResponses(),
                },
            },
        },
        async (_request, reply) => {
            noStore(reply);
            return {
                firstParty: { available: true, provider: 'wikione' },
                wikimedia: {
                    available: false,
                    reason: 'oauth-registration-pending',
                    message:
                        'WikiOne accounts are available. Wikimedia connection awaits public OAuth approval.',
                },
            } as const;
        },
    );

    app.post(
        '/v1/auth/register',
        {
            attachValidation: true,
            config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
            schema: {
                tags: ['authentication'],
                summary: 'Register a WikiOne account',
                description:
                    'Creates a first-party account and an HttpOnly session. Wikimedia identity is not created or connected.',
                headers: {
                    type: 'object',
                    properties: {
                        origin: {
                            type: 'string',
                            format: 'uri',
                            description:
                                'Required: exact configured WikiOne editor origin.',
                        },
                        'x-request-id':
                            openApiSchemas.commonRequestHeadersSchema
                                .properties['x-request-id'],
                    },
                },
                body: openApiSchemas.registrationRequest,
                response: {
                    201: {
                        ...openApiSchemas.authenticationSuccess,
                        headers: {
                            'set-cookie': {
                                schema: { type: 'string' },
                                description:
                                    'HttpOnly session cookie (Secure __Host-wikione_session in production).',
                            },
                        },
                    },
                    ...standardErrorResponses(),
                    403: openApiSchemas.errorResponse(
                        'The request origin is not an allowed WikiOne editor origin.',
                    ),
                    409: openApiSchemas.errorResponse(
                        'The requested username is unavailable.',
                    ),
                },
            },
        },
        async (request, reply) => {
            if (!allowOrigin(request, reply, options.editorOrigins)) {
                return;
            }
            const parsed = registrationRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                return sendApiError(
                    reply,
                    request,
                    400,
                    'invalid-request',
                    'Choose a valid username and display name, and use a password of at least 12 characters.',
                );
            }
            try {
                const issued = await options.authentication.register(
                    parsed.data,
                );
                setSessionCookie(
                    reply,
                    cookieName,
                    issued,
                    options.secureCookies,
                );
                noStore(reply);
                return reply.status(201).send({
                    session: toSessionStatus(issued.account, issued.payload),
                });
            } catch (error: unknown) {
                return sendAuthenticationFailure(reply, request, error);
            }
        },
    );

    app.post(
        '/v1/auth/login',
        {
            attachValidation: true,
            config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
            schema: {
                tags: ['authentication'],
                summary: 'Sign in to a WikiOne account',
                description:
                    'Creates a first-party account session. Authentication failures intentionally do not reveal whether a username exists.',
                headers: {
                    type: 'object',
                    properties: {
                        origin: {
                            type: 'string',
                            format: 'uri',
                            description:
                                'Required: exact configured WikiOne editor origin.',
                        },
                        'x-request-id':
                            openApiSchemas.commonRequestHeadersSchema
                                .properties['x-request-id'],
                    },
                },
                body: openApiSchemas.loginRequest,
                response: {
                    200: {
                        ...openApiSchemas.authenticationSuccess,
                        headers: {
                            'set-cookie': {
                                schema: { type: 'string' },
                                description: 'HttpOnly session cookie.',
                            },
                        },
                    },
                    ...standardErrorResponses(),
                    401: openApiSchemas.errorResponse(
                        'The supplied credentials are invalid.',
                    ),
                    403: openApiSchemas.errorResponse(
                        'The request origin is not an allowed WikiOne editor origin.',
                    ),
                },
            },
        },
        async (request, reply) => {
            if (!allowOrigin(request, reply, options.editorOrigins)) {
                return;
            }
            const parsed = loginRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                return sendApiError(
                    reply,
                    request,
                    400,
                    'invalid-request',
                    'A valid username and password are required.',
                );
            }
            try {
                const issued = await options.authentication.login(
                    parsed.data.username,
                    parsed.data.password,
                );
                setSessionCookie(
                    reply,
                    cookieName,
                    issued,
                    options.secureCookies,
                );
                noStore(reply);
                return {
                    session: toSessionStatus(issued.account, issued.payload),
                };
            } catch (error: unknown) {
                return sendAuthenticationFailure(reply, request, error);
            }
        },
    );

    app.get(
        '/v1/auth/session',
        {
            schema: {
                tags: ['authentication'],
                summary: 'Read the current session',
                description:
                    'Returns anonymous status without a valid session cookie, or the authenticated account identity and CSRF token.',
                response: {
                    200: openApiSchemas.sessionStatus,
                    ...standardErrorResponses(),
                },
            },
        },
        async (request, reply) => {
            noStore(reply);
            const token = request.cookies[cookieName];
            if (!token) {
                return anonymousStatus();
            }
            try {
                const session =
                    await options.authentication.authenticate(token);
                return toSessionStatus(session.account, session.payload);
            } catch (error: unknown) {
                if (error instanceof AuthenticationError) {
                    clearSessionCookie(
                        reply,
                        cookieName,
                        options.secureCookies,
                    );
                    return anonymousStatus();
                }
                throw error;
            }
        },
    );

    app.post(
        '/v1/auth/refresh',
        {
            attachValidation: true,
            config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
            schema: {
                tags: ['authentication'],
                summary: 'Refresh the current session',
                description:
                    'Rotates the single-use session token after checking the exact Origin, session cookie, and CSRF header.',
                security: [{ sessionCookie: [] }],
                headers: openApiSchemas.mutationHeadersSchema,
                response: {
                    200: {
                        ...openApiSchemas.authenticationSuccess,
                        headers: {
                            'set-cookie': {
                                schema: { type: 'string' },
                                description: 'Rotated HttpOnly session cookie.',
                            },
                        },
                    },
                    ...standardErrorResponses(),
                    401: openApiSchemas.errorResponse(
                        'A valid session cookie is required.',
                    ),
                    403: openApiSchemas.errorResponse(
                        'The Origin or CSRF token is invalid.',
                    ),
                },
            },
        },
        async (request, reply) => {
            const credentials = requireMutationCredentials(
                request,
                reply,
                cookieName,
                options.editorOrigins,
            );
            if (!credentials) {
                return;
            }
            try {
                const issued = await options.authentication.refresh(
                    credentials.token,
                    credentials.csrfToken,
                );
                setSessionCookie(
                    reply,
                    cookieName,
                    issued,
                    options.secureCookies,
                );
                noStore(reply);
                return {
                    session: toSessionStatus(issued.account, issued.payload),
                };
            } catch (error: unknown) {
                clearSessionCookie(reply, cookieName, options.secureCookies);
                return sendAuthenticationFailure(reply, request, error);
            }
        },
    );

    app.post(
        '/v1/auth/logout',
        {
            schema: {
                tags: ['authentication'],
                summary: 'Sign out this session',
                description:
                    'Revokes the current first-party session and clears its cookie.',
                security: [{ sessionCookie: [] }],
                headers: openApiSchemas.mutationHeadersSchema,
                response: {
                    204: openApiSchemas.noContent,
                    ...standardErrorResponses(),
                    401: openApiSchemas.errorResponse(
                        'A valid session cookie is required.',
                    ),
                    403: openApiSchemas.errorResponse(
                        'The Origin or CSRF token is invalid.',
                    ),
                },
            },
        },
        async (request, reply) =>
            closeSessions('current', request, reply, cookieName, options),
    );
    app.post(
        '/v1/auth/logout-all',
        {
            schema: {
                tags: ['authentication'],
                summary: 'Sign out all sessions',
                description:
                    'Revokes every active first-party session for the current account and clears this cookie.',
                security: [{ sessionCookie: [] }],
                headers: openApiSchemas.mutationHeadersSchema,
                response: {
                    204: openApiSchemas.noContent,
                    ...standardErrorResponses(),
                    401: openApiSchemas.errorResponse(
                        'A valid session cookie is required.',
                    ),
                    403: openApiSchemas.errorResponse(
                        'The Origin or CSRF token is invalid.',
                    ),
                },
            },
        },
        async (request, reply) =>
            closeSessions('all', request, reply, cookieName, options),
    );

    app.patch(
        '/v1/account',
        {
            attachValidation: true,
            schema: {
                tags: ['authentication'],
                summary: 'Update account display name',
                description:
                    'Updates the display name of the authenticated first-party account.',
                security: [{ sessionCookie: [] }],
                headers: openApiSchemas.mutationHeadersSchema,
                body: openApiSchemas.accountUpdateRequest,
                response: {
                    200: openApiSchemas.authenticationSuccess,
                    ...standardErrorResponses(),
                    401: openApiSchemas.errorResponse(
                        'A valid session cookie is required.',
                    ),
                    403: openApiSchemas.errorResponse(
                        'The Origin or CSRF token is invalid.',
                    ),
                },
            },
        },
        async (request, reply) => {
            const credentials = requireMutationCredentials(
                request,
                reply,
                cookieName,
                options.editorOrigins,
            );
            if (!credentials) {
                return;
            }
            const parsed = accountUpdateRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                return sendApiError(
                    reply,
                    request,
                    400,
                    'invalid-request',
                    'A display name between 1 and 80 characters is required.',
                );
            }
            try {
                const account = await options.authentication.updateDisplayName(
                    credentials.token,
                    credentials.csrfToken,
                    parsed.data.displayName,
                );
                const current = await options.authentication.authenticate(
                    credentials.token,
                );
                noStore(reply);
                return {
                    session: toSessionStatus(account, current.payload),
                };
            } catch (error: unknown) {
                return sendAuthenticationFailure(reply, request, error);
            }
        },
    );

    app.post(
        '/v1/account/password',
        {
            attachValidation: true,
            config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
            schema: {
                tags: ['authentication'],
                summary: 'Change account password',
                description:
                    'Changes the current account password and rotates the current session.',
                security: [{ sessionCookie: [] }],
                headers: openApiSchemas.mutationHeadersSchema,
                body: openApiSchemas.passwordChangeRequest,
                response: {
                    200: {
                        ...openApiSchemas.authenticationSuccess,
                        headers: {
                            'set-cookie': {
                                schema: { type: 'string' },
                                description: 'Rotated HttpOnly session cookie.',
                            },
                        },
                    },
                    ...standardErrorResponses(),
                    401: openApiSchemas.errorResponse(
                        'A valid session cookie and current password are required.',
                    ),
                    403: openApiSchemas.errorResponse(
                        'The Origin or CSRF token is invalid.',
                    ),
                },
            },
        },
        async (request, reply) => {
            const credentials = requireMutationCredentials(
                request,
                reply,
                cookieName,
                options.editorOrigins,
            );
            if (!credentials) {
                return;
            }
            const parsed = passwordChangeRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                return sendApiError(
                    reply,
                    request,
                    400,
                    'invalid-request',
                    'Current and new passwords are required; the new password must be at least 12 characters.',
                );
            }
            try {
                const issued = await options.authentication.changePassword(
                    credentials.token,
                    credentials.csrfToken,
                    parsed.data.currentPassword,
                    parsed.data.newPassword,
                );
                setSessionCookie(
                    reply,
                    cookieName,
                    issued,
                    options.secureCookies,
                );
                noStore(reply);
                return {
                    session: toSessionStatus(issued.account, issued.payload),
                };
            } catch (error: unknown) {
                return sendAuthenticationFailure(reply, request, error);
            }
        },
    );

    app.delete(
        '/v1/account',
        {
            attachValidation: true,
            config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
            schema: {
                tags: ['authentication'],
                summary: 'Delete the current account',
                description:
                    'Permanently deletes the authenticated first-party account after password and DELETE confirmation. This does not affect any Wikimedia account.',
                security: [{ sessionCookie: [] }],
                headers: openApiSchemas.mutationHeadersSchema,
                body: openApiSchemas.accountDeletionRequest,
                response: {
                    204: openApiSchemas.noContent,
                    ...standardErrorResponses(),
                    401: openApiSchemas.errorResponse(
                        'A valid session cookie and password are required.',
                    ),
                    403: openApiSchemas.errorResponse(
                        'The Origin or CSRF token is invalid.',
                    ),
                },
            },
        },
        async (request, reply) => {
            const credentials = requireMutationCredentials(
                request,
                reply,
                cookieName,
                options.editorOrigins,
            );
            if (!credentials) {
                return;
            }
            const parsed = accountDeletionRequestSchema.safeParse(request.body);
            if (!parsed.success) {
                return sendApiError(
                    reply,
                    request,
                    400,
                    'invalid-request',
                    'Enter your password and the exact confirmation DELETE.',
                );
            }
            try {
                await options.authentication.deleteAccount(
                    credentials.token,
                    credentials.csrfToken,
                    parsed.data.password,
                );
                clearSessionCookie(reply, cookieName, options.secureCookies);
                noStore(reply);
                return reply.status(204).send();
            } catch (error: unknown) {
                return sendAuthenticationFailure(reply, request, error);
            }
        },
    );

    for (const path of [
        '/v1/auth/wikimedia/start',
        '/v1/auth/wikimedia/callback',
    ]) {
        app.get(
            path,
            {
                schema: {
                    tags: ['authentication'],
                    summary: 'Wikimedia OAuth placeholder',
                    description:
                        'Public Wikimedia OAuth registration has not been approved. This route never starts or completes an authorization flow.',
                    response: {
                        503: openApiSchemas.errorResponse(
                            'Wikimedia OAuth registration is pending.',
                        ),
                        ...standardErrorResponses(),
                    },
                },
            },
            async (request, reply) =>
                sendApiError(
                    reply,
                    request,
                    503,
                    'wikimedia-oauth-unavailable',
                    'Wikimedia OAuth registration is pending. No authorization flow was started.',
                ),
        );
    }
}

async function closeSessions(
    scope: 'current' | 'all',
    request: FastifyRequest,
    reply: FastifyReply,
    cookieName: string,
    options: AuthRouteOptions,
): Promise<unknown> {
    const credentials = requireMutationCredentials(
        request,
        reply,
        cookieName,
        options.editorOrigins,
    );
    if (!credentials) {
        return undefined;
    }
    try {
        if (scope === 'all') {
            await options.authentication.logoutAll(
                credentials.token,
                credentials.csrfToken,
            );
        } else {
            await options.authentication.logout(
                credentials.token,
                credentials.csrfToken,
            );
        }
        clearSessionCookie(reply, cookieName, options.secureCookies);
        noStore(reply);
        return reply.status(204).send();
    } catch (error: unknown) {
        return sendAuthenticationFailure(reply, request, error);
    }
}

function requireMutationCredentials(
    request: FastifyRequest,
    reply: FastifyReply,
    cookieName: string,
    editorOrigins: readonly string[],
): { readonly token: string; readonly csrfToken: string } | undefined {
    if (!allowOrigin(request, reply, editorOrigins)) {
        return undefined;
    }
    const token = request.cookies[cookieName];
    const csrfToken = request.headers['x-wikione-csrf'];
    if (!token) {
        void sendApiError(
            reply,
            request,
            401,
            'authentication-required',
            'Sign in to continue.',
        );
        return undefined;
    }
    if (typeof csrfToken !== 'string') {
        void sendApiError(
            reply,
            request,
            403,
            'invalid-csrf',
            'The security token is missing or invalid.',
        );
        return undefined;
    }
    return { token, csrfToken };
}

function allowOrigin(
    request: FastifyRequest,
    reply: FastifyReply,
    editorOrigins: readonly string[],
): boolean {
    const origin = request.headers.origin;
    if (
        typeof origin !== 'string' ||
        !editorOrigins.includes(origin) ||
        request.headers['sec-fetch-site'] === 'cross-site'
    ) {
        void sendApiError(
            reply,
            request,
            403,
            'origin-not-allowed',
            'This account action must come from the WikiOne editor origin.',
        );
        return false;
    }
    return true;
}

function toSessionStatus(
    account: AccountRecord,
    payload: SessionPayload,
): SessionStatus {
    return {
        authenticated: true,
        account: {
            provider: 'wikione',
            accountId: account.id,
            username: account.username,
            displayName: account.displayName,
            createdAt: account.createdAt,
        },
        csrfToken: payload.csrfToken,
        expiresAt: payload.expiresAt,
        absoluteExpiresAt: payload.absoluteExpiresAt,
        wikimedia: wikimediaUnavailable,
    };
}

function anonymousStatus(): SessionStatus {
    return { authenticated: false, wikimedia: wikimediaUnavailable };
}

function setSessionCookie(
    reply: FastifyReply,
    cookieName: string,
    issued: IssuedSession,
    secure: boolean,
): void {
    const maxAge = Math.max(
        1,
        Math.floor(
            (Date.parse(issued.payload.absoluteExpiresAt) - Date.now()) / 1_000,
        ),
    );
    reply.setCookie(cookieName, issued.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure,
        maxAge,
    });
}

function clearSessionCookie(
    reply: FastifyReply,
    cookieName: string,
    secure: boolean,
): void {
    reply.clearCookie(cookieName, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure,
    });
}

async function sendAuthenticationFailure(
    reply: FastifyReply,
    request: FastifyRequest,
    error: unknown,
): Promise<ApiError> {
    if (error instanceof AuthenticationError) {
        const statusCode =
            error.code === 'username-unavailable'
                ? 409
                : error.code === 'weak-password'
                  ? 400
                  : error.code === 'invalid-csrf'
                    ? 403
                    : 401;
        return sendApiError(
            reply,
            request,
            statusCode,
            error.code,
            error.issues[0] ?? error.message,
        );
    }
    if (error instanceof Error && error.name === 'AccountConflictError') {
        return sendApiError(
            reply,
            request,
            409,
            'username-unavailable',
            'That username is unavailable.',
        );
    }
    throw error;
}

async function sendApiError(
    reply: FastifyReply,
    request: FastifyRequest,
    statusCode: number,
    code: string,
    message: string,
): Promise<ApiError> {
    noStore(reply);
    const error: ApiError = { code, message, requestId: request.id };
    await reply.status(statusCode).send(error);
    return error;
}

function noStore(reply: FastifyReply): void {
    reply.header('Cache-Control', 'no-store');
    reply.header('Vary', 'Origin');
}
