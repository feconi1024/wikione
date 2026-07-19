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
        { schema: { tags: ['authentication'] } },
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
            config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
            schema: { tags: ['authentication'] },
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
            config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
            schema: { tags: ['authentication'] },
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
        { schema: { tags: ['authentication'] } },
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
            config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
            schema: { tags: ['authentication'] },
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
        { schema: { tags: ['authentication'] } },
        async (request, reply) =>
            closeSessions('current', request, reply, cookieName, options),
    );
    app.post(
        '/v1/auth/logout-all',
        { schema: { tags: ['authentication'] } },
        async (request, reply) =>
            closeSessions('all', request, reply, cookieName, options),
    );

    app.patch(
        '/v1/account',
        { schema: { tags: ['authentication'] } },
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
            config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
            schema: { tags: ['authentication'] },
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
            config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
            schema: { tags: ['authentication'] },
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
            { schema: { tags: ['authentication'] } },
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
