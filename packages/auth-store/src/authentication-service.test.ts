import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
    AuthenticationError,
    AuthenticationService,
    createPasswordHasher,
    type SessionKeyRing,
} from '@wikione/auth-core';

import { MemoryAccountRepository, MemorySessionRepository } from './index.js';

const timestamp = Date.parse('2026-07-19T00:00:00.000Z');
const testHasher = createPasswordHasher({
    cost: 1_024,
    blockSize: 8,
    parallelization: 1,
    maxMemory: 16 * 1024 * 1024,
});
const keys: SessionKeyRing = {
    activeKeyId: 'test',
    encryptionKeys: { test: randomBytes(32) },
    lookupHmacKey: randomBytes(32),
};

describe('first-party authentication service', () => {
    it('registers, authenticates, refreshes, and revokes a replayed family', async () => {
        const fixture = createFixture();
        const registered = await fixture.service.register({
            username: 'Example',
            displayName: 'Example editor',
            password: 'correct horse battery staple',
        });

        expect(registered.account.normalizedUsername).toBe('example');
        await expect(
            fixture.service.authenticate(registered.token),
        ).resolves.toMatchObject({ account: { username: 'Example' } });

        const refreshed = await fixture.service.refresh(
            registered.token,
            registered.payload.csrfToken,
        );
        expect(refreshed.token).not.toBe(registered.token);
        expect(refreshed.payload.generation).toBe(1);

        await expect(
            fixture.service.authenticate(registered.token),
        ).rejects.toMatchObject({ code: 'session-expired' });
        await expect(
            fixture.service.authenticate(refreshed.token),
        ).rejects.toMatchObject({ code: 'authentication-required' });
    });

    it('uses generic login failures and rejects bad CSRF tokens', async () => {
        const fixture = createFixture();
        const registered = await fixture.service.register({
            username: 'Example',
            displayName: 'Example editor',
            password: 'correct horse battery staple',
        });

        await expect(
            fixture.service.login('Example', 'incorrect password'),
        ).rejects.toMatchObject({ code: 'invalid-credentials' });
        await expect(
            fixture.service.logout(registered.token, 'wrong'),
        ).rejects.toMatchObject({ code: 'invalid-csrf' });
    });

    it('rotates all sessions after a password change and supports deletion', async () => {
        const fixture = createFixture();
        const registered = await fixture.service.register({
            username: 'Example',
            displayName: 'Example editor',
            password: 'correct horse battery staple',
        });
        const renamed = await fixture.service.updateDisplayName(
            registered.token,
            registered.payload.csrfToken,
            'New display name',
        );
        expect(renamed.displayName).toBe('New display name');

        const changed = await fixture.service.changePassword(
            registered.token,
            registered.payload.csrfToken,
            'correct horse battery staple',
            'a completely different secure passphrase',
        );
        await expect(
            fixture.service.authenticate(registered.token),
        ).rejects.toBeInstanceOf(AuthenticationError);

        const loggedIn = await fixture.service.login(
            'Example',
            'a completely different secure passphrase',
        );
        expect(loggedIn.account.displayName).toBe('New display name');

        await fixture.service.deleteAccount(
            loggedIn.token,
            loggedIn.payload.csrfToken,
            'a completely different secure passphrase',
        );
        await expect(
            fixture.service.login(
                'Example',
                'a completely different secure passphrase',
            ),
        ).rejects.toMatchObject({ code: 'invalid-credentials' });
        await expect(
            fixture.service.authenticate(changed.token),
        ).rejects.toMatchObject({ code: 'authentication-required' });
    });

    it('expires idle sessions independently of the repository TTL', async () => {
        let now = timestamp;
        const fixture = createFixture(() => now);
        const registered = await fixture.service.register({
            username: 'Example',
            displayName: 'Example editor',
            password: 'correct horse battery staple',
        });
        now += 31 * 60 * 1_000;
        await expect(
            fixture.service.authenticate(registered.token),
        ).rejects.toMatchObject({ code: 'session-expired' });
    });

    it('permits only one rotation of the same session token', async () => {
        const fixture = createFixture();
        const registered = await fixture.service.register({
            username: 'Example',
            displayName: 'Example editor',
            password: 'correct horse battery staple',
        });
        const attempts = await Promise.allSettled([
            fixture.service.refresh(
                registered.token,
                registered.payload.csrfToken,
            ),
            fixture.service.refresh(
                registered.token,
                registered.payload.csrfToken,
            ),
        ]);
        expect(
            attempts.filter((attempt) => attempt.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            attempts.filter((attempt) => attempt.status === 'rejected'),
        ).toHaveLength(1);
    });
});

function createFixture(now: () => number = () => timestamp): {
    readonly service: AuthenticationService;
} {
    const accounts = new MemoryAccountRepository();
    const sessions = new MemorySessionRepository(keys, now);
    let tokenIndex = 0;
    const alphabet =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    return {
        service: new AuthenticationService({
            accounts,
            sessions,
            passwordHasher: testHasher,
            now,
            createId: () => 'bb2f82ee-29f2-41c9-bd38-630f1228a967',
            createToken: () => {
                const character = alphabet[tokenIndex % alphabet.length] ?? 'A';
                tokenIndex += 1;
                return character.repeat(43);
            },
        }),
    };
}
