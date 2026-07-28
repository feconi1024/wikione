import type { TransactionSql } from 'postgres';

export const accountMigrationLockId = 9_164_111_234;

/** Applies account-schema migrations while the caller holds the transaction. */
export async function migrateAccountSchema(sql: TransactionSql): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(${accountMigrationLockId})`;
    await sql`
        CREATE TABLE IF NOT EXISTS wikione_schema_migrations (
            version integer PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )
    `;
    const applied = await sql<{ version: number }[]>`
        SELECT version FROM wikione_schema_migrations WHERE version = 1
    `;
    if (applied.length === 0) {
        await sql`
            CREATE TABLE IF NOT EXISTS wikione_accounts (
                id uuid PRIMARY KEY,
                username varchar(40) NOT NULL,
                normalized_username varchar(80) NOT NULL UNIQUE,
                display_name varchar(80) NOT NULL,
                password_hash text NOT NULL,
                created_at timestamptz NOT NULL,
                updated_at timestamptz NOT NULL
            )
        `;
        await sql`
            INSERT INTO wikione_schema_migrations (version)
            VALUES (1)
            ON CONFLICT (version) DO NOTHING
        `;
    }
}
