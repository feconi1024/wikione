import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
    decryptSessionPayload,
    encryptSessionPayload,
    equalCsrfToken,
    generateOpaqueToken,
    hashOpaqueToken,
    type SessionKeyRing,
} from './session-crypto.js';

const keys: SessionKeyRing = {
    activeKeyId: 'test',
    encryptionKeys: { test: randomBytes(32) },
    lookupHmacKey: randomBytes(32),
};
const payload = {
    accountId: 'bb2f82ee-29f2-41c9-bd38-630f1228a967',
    familyId: 'family',
    csrfToken: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
    issuedAt: '2026-07-19T00:00:00.000Z',
    expiresAt: '2026-07-19T00:30:00.000Z',
    absoluteExpiresAt: '2026-07-19T08:00:00.000Z',
    generation: 0,
};

describe('encrypted session primitives', () => {
    it('creates opaque tokens and non-reversible lookup keys', () => {
        const token = generateOpaqueToken();
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        expect(hashOpaqueToken(token, keys)).not.toContain(token);
    });

    it('encrypts, authenticates, and decrypts session payloads', () => {
        const encrypted = encryptSessionPayload(payload, keys);
        expect(encrypted).not.toContain(payload.accountId);
        expect(decryptSessionPayload(encrypted, keys)).toEqual(payload);
        const parts = encrypted.split('.');
        const ciphertext = parts[3] ?? '';
        parts[3] = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
        expect(decryptSessionPayload(parts.join('.'), keys)).toBeUndefined();
    });

    it('compares CSRF tokens safely', () => {
        expect(equalCsrfToken(payload.csrfToken, payload.csrfToken)).toBe(true);
        expect(equalCsrfToken('wrong', payload.csrfToken)).toBe(false);
    });
});
