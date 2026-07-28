import postgres from 'postgres';

import { migrateAccountSchema } from './postgres-account-schema.js';

export interface PostgresDatabaseBootstrapOptions {
    readonly applicationPassword: string;
    readonly applicationUser: string;
    readonly bootstrapUrl: string;
}

/**
 * Migrates the dedicated database as its bootstrap owner, then reduces the
 * long-running application role to the exact account-table data operations.
 */
export async function bootstrapPostgresDatabase(
    options: PostgresDatabaseBootstrapOptions,
): Promise<void> {
    const databaseName = readDatabaseName(options.bootstrapUrl);
    assertRoleName(options.applicationUser);
    assertApplicationPassword(options.applicationPassword);
    const role = quoteIdentifier(options.applicationUser);
    const database = quoteIdentifier(databaseName);
    const password = quoteLiteral(options.applicationPassword);
    const sql = postgres(options.bootstrapUrl, {
        connect_timeout: 10,
        idle_timeout: 5,
        max: 1,
    });

    try {
        await sql.begin(async (transaction) => {
            await migrateAccountSchema(transaction);
            const existing = await transaction<{ exists: boolean }[]>`
                SELECT EXISTS (
                    SELECT 1 FROM pg_roles WHERE rolname = ${options.applicationUser}
                ) AS exists
            `;
            if (existing[0]?.exists) {
                await transaction.unsafe(
                    `ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 50 PASSWORD ${password}`,
                );
            } else {
                await transaction.unsafe(
                    `CREATE ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 50 PASSWORD ${password}`,
                );
            }

            await transaction.unsafe(
                `REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${role}`,
            );
            await transaction.unsafe(
                `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${role}`,
            );
            await transaction.unsafe(
                `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`,
            );
            await transaction.unsafe(
                `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`,
            );
            await transaction`REVOKE CREATE ON SCHEMA public FROM PUBLIC`;
            await transaction.unsafe(
                `GRANT CONNECT ON DATABASE ${database} TO ${role}`,
            );
            await transaction.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
            await transaction.unsafe(
                `GRANT SELECT ON TABLE wikione_schema_migrations TO ${role}`,
            );
            await transaction.unsafe(
                `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wikione_accounts TO ${role}`,
            );
            await transaction.unsafe(
                `ALTER ROLE ${role} IN DATABASE ${database} SET statement_timeout = '15s'`,
            );
            await transaction.unsafe(
                `ALTER ROLE ${role} IN DATABASE ${database} SET idle_in_transaction_session_timeout = '15s'`,
            );
        });
    } finally {
        await sql.end({ timeout: 5 });
    }
}

function readDatabaseName(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new TypeError('Bootstrap database URL is invalid.');
    }
    if (
        (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
        !url.username ||
        !url.password ||
        !url.hostname ||
        url.hash
    ) {
        throw new TypeError(
            'Bootstrap database URL must contain PostgreSQL credentials and no fragment.',
        );
    }
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(name)) {
        throw new TypeError(
            'Database name must be a safe PostgreSQL identifier.',
        );
    }
    return name;
}

function assertRoleName(value: string): void {
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value)) {
        throw new TypeError(
            'Application database user must be a safe PostgreSQL identifier.',
        );
    }
}

function assertApplicationPassword(value: string): void {
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(value)) {
        throw new TypeError(
            'Application database password must be a 32–128 character opaque value.',
        );
    }
}

function quoteIdentifier(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}
