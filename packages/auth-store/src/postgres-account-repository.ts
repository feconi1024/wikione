import postgres, { type Sql } from 'postgres';

import type { AccountRecord, AccountRepository } from '@wikione/auth-core';

import { AccountConflictError } from './memory-account-repository.js';

interface AccountRow {
    readonly id: string;
    readonly username: string;
    readonly normalized_username: string;
    readonly display_name: string;
    readonly password_hash: string;
    readonly created_at: Date;
    readonly updated_at: Date;
}

export class PostgresAccountRepository implements AccountRepository {
    readonly #sql: Sql;

    private constructor(sql: Sql) {
        this.#sql = sql;
    }

    public static async connect(
        url: string,
    ): Promise<PostgresAccountRepository> {
        const parsed = new URL(url);
        if (
            parsed.protocol !== 'postgres:' &&
            parsed.protocol !== 'postgresql:'
        ) {
            throw new TypeError(
                'DATABASE_URL must use postgres:// or postgresql://.',
            );
        }
        const sql = postgres(url, { max: 10, idle_timeout: 20 });
        const repository = new PostgresAccountRepository(sql);
        await repository.migrate();
        return repository;
    }

    public async migrate(): Promise<void> {
        await this.#sql.begin(async (sql) => {
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
                    CREATE TABLE wikione_accounts (
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
                    INSERT INTO wikione_schema_migrations (version) VALUES (1)
                `;
            }
        });
    }

    public async create(account: AccountRecord): Promise<AccountRecord> {
        try {
            const rows = await this.#sql<AccountRow[]>`
                INSERT INTO wikione_accounts (
                    id, username, normalized_username, display_name,
                    password_hash, created_at, updated_at
                ) VALUES (
                    ${account.id}, ${account.username},
                    ${account.normalizedUsername}, ${account.displayName},
                    ${account.passwordHash}, ${account.createdAt},
                    ${account.updatedAt}
                )
                RETURNING *
            `;
            return mapAccount(assertRow(rows[0]));
        } catch (error: unknown) {
            if (isUniqueViolation(error)) {
                throw new AccountConflictError();
            }
            throw error;
        }
    }

    public async findById(id: string): Promise<AccountRecord | undefined> {
        const rows = await this.#sql<AccountRow[]>`
            SELECT * FROM wikione_accounts WHERE id = ${id}
        `;
        return rows[0] ? mapAccount(rows[0]) : undefined;
    }

    public async findByNormalizedUsername(
        username: string,
    ): Promise<AccountRecord | undefined> {
        const rows = await this.#sql<AccountRow[]>`
            SELECT * FROM wikione_accounts
            WHERE normalized_username = ${username}
        `;
        return rows[0] ? mapAccount(rows[0]) : undefined;
    }

    public async updateDisplayName(
        id: string,
        displayName: string,
        updatedAt: string,
    ): Promise<AccountRecord | undefined> {
        const rows = await this.#sql<AccountRow[]>`
            UPDATE wikione_accounts
            SET display_name = ${displayName}, updated_at = ${updatedAt}
            WHERE id = ${id}
            RETURNING *
        `;
        return rows[0] ? mapAccount(rows[0]) : undefined;
    }

    public async updatePassword(
        id: string,
        passwordHash: string,
        updatedAt: string,
    ): Promise<AccountRecord | undefined> {
        const rows = await this.#sql<AccountRow[]>`
            UPDATE wikione_accounts
            SET password_hash = ${passwordHash}, updated_at = ${updatedAt}
            WHERE id = ${id}
            RETURNING *
        `;
        return rows[0] ? mapAccount(rows[0]) : undefined;
    }

    public async delete(id: string): Promise<boolean> {
        const rows = await this.#sql<{ id: string }[]>`
            DELETE FROM wikione_accounts WHERE id = ${id} RETURNING id
        `;
        return rows.length > 0;
    }

    public async close(): Promise<void> {
        await this.#sql.end({ timeout: 5 });
    }
}

function mapAccount(row: AccountRow): AccountRecord {
    return {
        id: row.id,
        username: row.username,
        normalizedUsername: row.normalized_username,
        displayName: row.display_name,
        passwordHash: row.password_hash,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

function assertRow(row: AccountRow | undefined): AccountRow {
    if (!row) {
        throw new Error('PostgreSQL did not return the created account.');
    }
    return row;
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
    );
}
