import { describe, expect, it } from 'vitest';

import {
    createPasswordHasher,
    normalizeUsername,
    validatePassword,
} from './password.js';

const testParameters = {
    cost: 1_024,
    blockSize: 8,
    parallelization: 1,
    maxMemory: 16 * 1024 * 1024,
};

describe('password security primitives', () => {
    it('normalizes compatibility characters and case consistently', () => {
        expect(normalizeUsername('  Ａlice ')).toBe('alice');
    });

    it('reports length and username policy failures', () => {
        expect(validatePassword('short', 'Alice')).toContain(
            'Use at least 12 characters.',
        );
        expect(
            validatePassword('Alice has a long password', 'Alice'),
        ).toContain('Do not include your username in your password.');
    });

    it('salts hashes and verifies without accepting malformed values', async () => {
        const hasher = createPasswordHasher(testParameters);
        const first = await hasher.hash('correct horse battery staple');
        const second = await hasher.hash('correct horse battery staple');

        expect(first).not.toBe(second);
        await expect(
            hasher.verify('correct horse battery staple', first),
        ).resolves.toBe(true);
        await expect(hasher.verify('wrong password', first)).resolves.toBe(
            false,
        );
        await expect(hasher.verify('password', 'not-a-hash')).resolves.toBe(
            false,
        );
    });
});
