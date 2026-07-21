import { describe, expect, it } from 'vitest';

import { bootstrapPostgresDatabase } from './postgres-database-bootstrap.js';

const options = {
    applicationPassword: 'ApplicationPassword0123456789abcdef',
    applicationUser: 'wikione_app',
    bootstrapUrl: 'postgres://wikione:secret@127.0.0.1:1/wikione',
} as const;

describe('PostgreSQL database bootstrap validation', () => {
    it.each([
        [{ ...options, applicationUser: 'bad-user' }, 'database user'],
        [{ ...options, applicationPassword: 'short' }, 'password'],
        [
            { ...options, bootstrapUrl: 'redis://user:secret@cache/wikione' },
            'URL',
        ],
        [
            { ...options, bootstrapUrl: 'postgres://user:secret@db/bad-name' },
            'Database name',
        ],
    ] as const)(
        'rejects unsafe bootstrap input before connecting',
        async (input, message) => {
            await expect(bootstrapPostgresDatabase(input)).rejects.toThrow(
                message,
            );
        },
    );
});
