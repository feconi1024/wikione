import { randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
    AuthenticationService,
    createPasswordHasher,
    type SessionKeyRing,
} from '@wikione/auth-core';
import {
    MemoryAccountRepository,
    MemorySessionRepository,
} from '@wikione/auth-store';
import { MemoryPreviewStore } from '@wikione/preview-store';

import { buildApi } from './app.js';

const origin = 'http://127.0.0.1:5173';
const timestamp = Date.parse('2026-07-19T00:00:00.000Z');
const password = 'correct horse battery staple';
const replacementPassword = 'a completely different secure passphrase';
const openApps: Awaited<ReturnType<typeof buildApi>>[] = [];

afterEach(async () => {
    await Promise.all(openApps.splice(0).map(async (app) => app.close()));
});

describe('first-party authentication API', () => {
    it('registers, recovers identity, and sets a constrained local cookie', async () => {
        const app = await createAuthApi();
        const registration = await register(app);
        const cookie = readCookie(registration.headers['set-cookie']);

        expect(registration.statusCode).toBe(201);
        expect(registration.headers['set-cookie']).toContain('HttpOnly');
        expect(registration.headers['set-cookie']).toContain('SameSite=Lax');
        expect(registration.headers['set-cookie']).not.toContain('Secure');
        expect(registration.headers['cache-control']).toBe('no-store');

        const session = await app.inject({
            method: 'GET',
            url: '/v1/auth/session',
            headers: { cookie },
        });
        expect(session.json()).toMatchObject({
            authenticated: true,
            account: {
                provider: 'wikione',
                username: 'Example',
                displayName: 'Example editor',
            },
            wikimedia: {
                connected: false,
                reason: 'oauth-registration-pending',
            },
        });
    });

    it('requires exact Origin and synchronizer CSRF for account mutations', async () => {
        const app = await createAuthApi();
        const registration = await register(app);
        const cookie = readCookie(registration.headers['set-cookie']);
        const csrfToken = readCsrf(registration);

        const missingOrigin = await app.inject({
            method: 'PATCH',
            url: '/v1/account',
            headers: { cookie, 'x-wikione-csrf': csrfToken },
            payload: { displayName: 'Changed' },
        });
        const hostileOrigin = await app.inject({
            method: 'PATCH',
            url: '/v1/account',
            headers: {
                cookie,
                origin: 'https://attacker.example',
                'x-wikione-csrf': csrfToken,
            },
            payload: { displayName: 'Changed' },
        });
        const missingCsrf = await app.inject({
            method: 'PATCH',
            url: '/v1/account',
            headers: { cookie, origin },
            payload: { displayName: 'Changed' },
        });
        const allowed = await app.inject({
            method: 'PATCH',
            url: '/v1/account',
            headers: { cookie, origin, 'x-wikione-csrf': csrfToken },
            payload: { displayName: 'Changed' },
        });

        expect(missingOrigin.json()).toMatchObject({
            code: 'origin-not-allowed',
        });
        expect(hostileOrigin.statusCode).toBe(403);
        expect(missingCsrf.json()).toMatchObject({ code: 'invalid-csrf' });
        expect(allowed.json()).toMatchObject({
            session: { account: { displayName: 'Changed' } },
        });
    });

    it('rotates refresh tokens and revokes the family on replay', async () => {
        const app = await createAuthApi();
        const registration = await register(app);
        const oldCookie = readCookie(registration.headers['set-cookie']);
        const csrfToken = readCsrf(registration);
        const refreshed = await app.inject({
            method: 'POST',
            url: '/v1/auth/refresh',
            headers: { cookie: oldCookie, origin, 'x-wikione-csrf': csrfToken },
        });
        const newCookie = readCookie(refreshed.headers['set-cookie']);
        expect(refreshed.statusCode).toBe(200);
        expect(newCookie).not.toBe(oldCookie);

        const replay = await app.inject({
            method: 'POST',
            url: '/v1/auth/refresh',
            headers: { cookie: oldCookie, origin, 'x-wikione-csrf': csrfToken },
        });
        const revoked = await app.inject({
            method: 'GET',
            url: '/v1/auth/session',
            headers: { cookie: newCookie },
        });
        expect(replay.statusCode).toBe(401);
        expect(revoked.json()).toMatchObject({ authenticated: false });
    });

    it('changes passwords, logs out all sessions, and deletes accounts', async () => {
        const app = await createAuthApi();
        const registration = await register(app);
        const originalCookie = readCookie(registration.headers['set-cookie']);
        const changed = await app.inject({
            method: 'POST',
            url: '/v1/account/password',
            headers: {
                cookie: originalCookie,
                origin,
                'x-wikione-csrf': readCsrf(registration),
            },
            payload: {
                currentPassword: password,
                newPassword: replacementPassword,
            },
        });
        expect(changed.statusCode).toBe(200);

        const login = await app.inject({
            method: 'POST',
            url: '/v1/auth/login',
            headers: { origin },
            payload: { username: 'Example', password: replacementPassword },
        });
        const loginCookie = readCookie(login.headers['set-cookie']);
        const logoutAll = await app.inject({
            method: 'POST',
            url: '/v1/auth/logout-all',
            headers: {
                cookie: loginCookie,
                origin,
                'x-wikione-csrf': readCsrf(login),
            },
        });
        expect(logoutAll.statusCode).toBe(204);

        const loginAgain = await app.inject({
            method: 'POST',
            url: '/v1/auth/login',
            headers: { origin },
            payload: { username: 'Example', password: replacementPassword },
        });
        const deletion = await app.inject({
            method: 'DELETE',
            url: '/v1/account',
            headers: {
                cookie: readCookie(loginAgain.headers['set-cookie']),
                origin,
                'x-wikione-csrf': readCsrf(loginAgain),
            },
            payload: { password: replacementPassword, confirmation: 'DELETE' },
        });
        expect(deletion.statusCode).toBe(204);

        const rejectedLogin = await app.inject({
            method: 'POST',
            url: '/v1/auth/login',
            headers: { origin },
            payload: { username: 'Example', password: replacementPassword },
        });
        expect(rejectedLogin.json()).toMatchObject({
            code: 'invalid-credentials',
        });
    });

    it('keeps Wikimedia OAuth redirects inert and advertises credentialed CORS', async () => {
        const app = await createAuthApi();
        const placeholder = await app.inject({
            method: 'GET',
            url: '/v1/auth/wikimedia/start?returnTo=%2F',
        });
        const preflight = await app.inject({
            method: 'OPTIONS',
            url: '/v1/auth/login',
            headers: {
                origin,
                'access-control-request-method': 'POST',
            },
        });

        expect(placeholder.statusCode).toBe(503);
        expect(placeholder.json()).toMatchObject({
            code: 'wikimedia-oauth-unavailable',
        });
        expect(preflight.headers['access-control-allow-origin']).toBe(origin);
        expect(preflight.headers['access-control-allow-credentials']).toBe(
            'true',
        );
    });
});

async function createAuthApi(): Promise<Awaited<ReturnType<typeof buildApi>>> {
    const keys: SessionKeyRing = {
        activeKeyId: 'test',
        encryptionKeys: { test: randomBytes(32) },
        lookupHmacKey: randomBytes(32),
    };
    const authentication = new AuthenticationService({
        accounts: new MemoryAccountRepository(),
        sessions: new MemorySessionRepository(keys, () => timestamp),
        passwordHasher: createPasswordHasher({
            cost: 1_024,
            blockSize: 8,
            parallelization: 1,
            maxMemory: 16 * 1024 * 1024,
        }),
        now: () => timestamp,
    });
    const app = await buildApi({
        authentication,
        editorOrigins: [origin],
        now: () => timestamp,
        previewStore: new MemoryPreviewStore(() => timestamp),
    });
    openApps.push(app);
    return app;
}

async function register(
    app: Awaited<ReturnType<typeof buildApi>>,
): Promise<Awaited<ReturnType<typeof app.inject>>> {
    return app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { origin },
        payload: {
            username: 'Example',
            displayName: 'Example editor',
            password,
        },
    });
}

function readCookie(value: string | string[] | undefined): string {
    const header = Array.isArray(value) ? value[0] : value;
    if (!header) {
        throw new Error('Expected a Set-Cookie header.');
    }
    return header.split(';')[0] ?? '';
}

function readCsrf(response: { readonly json: () => unknown }): string {
    const body = response.json() as {
        readonly session?: { readonly csrfToken?: unknown };
    };
    if (typeof body.session?.csrfToken !== 'string') {
        throw new Error('Expected an authenticated session response.');
    }
    return body.session.csrfToken;
}
