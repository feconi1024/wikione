import { describe, expect, it } from 'vitest';

import { readDatabaseMigrationConfig } from './database-migration-config.js';

const environment = {
    DATABASE_BOOTSTRAP_PASSWORD: "master:/?#[]@'secret",
    DATABASE_BOOTSTRAP_USER: 'wikione',
    DATABASE_HOST: 'database.internal',
    DATABASE_NAME: 'wikione',
    DATABASE_PASSWORD: 'ApplicationPassword0123456789abcdef',
    DATABASE_PORT: '5432',
    DATABASE_USER: 'wikione_app',
    NODE_ENV: 'production',
} as const;

describe('database migration configuration', () => {
    it('builds a TLS bootstrap URL while keeping the application identity separate', () => {
        const config = readDatabaseMigrationConfig(environment);
        const url = new URL(config.bootstrapUrl);

        expect(url.protocol).toBe('postgresql:');
        expect(url.hostname).toBe('database.internal');
        expect(url.username).toBe('wikione');
        expect(decodeURIComponent(url.password)).toBe(
            environment.DATABASE_BOOTSTRAP_PASSWORD,
        );
        expect(url.searchParams.get('sslmode')).toBe('require');
        expect(config.applicationUser).toBe('wikione_app');
        expect(config.applicationPassword).toBe(environment.DATABASE_PASSWORD);
    });

    it.each([
        ['DATABASE_HOST', 'bad/host'],
        ['DATABASE_PORT', '0'],
        ['DATABASE_NAME', 'bad-name'],
        ['DATABASE_BOOTSTRAP_USER', 'BadUser'],
        ['DATABASE_USER', 'bad-user'],
    ] as const)(
        'rejects an invalid %s without exposing secrets',
        (name, value) => {
            expect(() =>
                readDatabaseMigrationConfig({ ...environment, [name]: value }),
            ).toThrow(name);
            try {
                readDatabaseMigrationConfig({ ...environment, [name]: value });
            } catch (error) {
                expect(String(error)).not.toContain(
                    environment.DATABASE_BOOTSTRAP_PASSWORD,
                );
                expect(String(error)).not.toContain(
                    environment.DATABASE_PASSWORD,
                );
            }
        },
    );
});
