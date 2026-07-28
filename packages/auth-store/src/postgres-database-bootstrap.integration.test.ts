import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { bootstrapPostgresDatabase } from './postgres-database-bootstrap.js';

const bootstrapUrl = process.env.POSTGRES_INTEGRATION_URL;
const applicationUser = 'wikione_app_integration';
const applicationPassword = 'IntegrationPassword0123456789abcdef';

describe.skipIf(!bootstrapUrl)(
    'PostgreSQL database bootstrap integration',
    () => {
        afterAll(async () => {
            if (!bootstrapUrl) {
                return;
            }
            const admin = postgres(bootstrapUrl, { max: 1 });
            try {
                await admin.unsafe(`DROP OWNED BY "${applicationUser}"`);
                await admin.unsafe(`DROP ROLE IF EXISTS "${applicationUser}"`);
                await admin`GRANT CREATE ON SCHEMA public TO PUBLIC`;
            } finally {
                await admin.end({ timeout: 5 });
            }
        });

        it('serializes concurrent migrations and grants only account-table DML', async () => {
            if (!bootstrapUrl) {
                throw new Error('POSTGRES_INTEGRATION_URL is required.');
            }
            const options = {
                bootstrapUrl,
                applicationUser,
                applicationPassword,
            };
            await Promise.all([
                bootstrapPostgresDatabase(options),
                bootstrapPostgresDatabase(options),
            ]);

            const applicationUrl = new URL(bootstrapUrl);
            applicationUrl.username = applicationUser;
            applicationUrl.password = applicationPassword;
            const application = postgres(applicationUrl.toString(), { max: 1 });
            try {
                const rows = await application<
                    {
                        account_delete: boolean;
                        account_insert: boolean;
                        account_select: boolean;
                        account_truncate: boolean;
                        account_update: boolean;
                        connect: boolean;
                        current_user: string;
                        schema_create: boolean;
                        schema_usage: boolean;
                    }[]
                >`
                SELECT
                    current_user,
                    has_database_privilege(current_user, current_database(), 'CONNECT') AS connect,
                    has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
                    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
                    has_table_privilege(current_user, 'wikione_accounts', 'SELECT') AS account_select,
                    has_table_privilege(current_user, 'wikione_accounts', 'INSERT') AS account_insert,
                    has_table_privilege(current_user, 'wikione_accounts', 'UPDATE') AS account_update,
                    has_table_privilege(current_user, 'wikione_accounts', 'DELETE') AS account_delete,
                    has_table_privilege(current_user, 'wikione_accounts', 'TRUNCATE') AS account_truncate
            `;
                expect(rows[0]).toEqual({
                    current_user: applicationUser,
                    connect: true,
                    schema_usage: true,
                    schema_create: false,
                    account_select: true,
                    account_insert: true,
                    account_update: true,
                    account_delete: true,
                    account_truncate: false,
                });
                await expect(
                    application`CREATE TABLE wikione_forbidden_probe (id integer)`,
                ).rejects.toMatchObject({ code: '42501' });
            } finally {
                await application.end({ timeout: 5 });
            }
        });
    },
);
