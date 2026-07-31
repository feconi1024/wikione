import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const suffix = randomBytes(6).toString('hex');
const sourceDatabase = `wikione_restore_source_${suffix}`;
const restoredDatabase = `wikione_restore_target_${suffix}`;
const probeUsername = `restore_probe_${suffix}`;
const startedAt = performance.now();
let failure: unknown;
let evidence: Record<string, unknown> = {};

try {
    const mainAccountCountBefore = queryInteger(
        'wikione',
        'SELECT count(*) FROM wikione_accounts',
    );

    dockerPostgres([
        'createdb',
        '--username',
        'wikione',
        '--template',
        'template0',
        '--encoding',
        'UTF8',
        sourceDatabase,
    ]);

    const schema = dockerPostgres([
        'pg_dump',
        '--username',
        'wikione',
        '--dbname',
        'wikione',
        '--schema-only',
        '--no-owner',
        '--no-privileges',
    ]);
    dockerPostgres(
        [
            'psql',
            '--username',
            'wikione',
            '--dbname',
            sourceDatabase,
            '--set',
            'ON_ERROR_STOP=1',
        ],
        schema,
    );
    dockerPostgres([
        'psql',
        '--username',
        'wikione',
        '--dbname',
        sourceDatabase,
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        [
            'INSERT INTO wikione_schema_migrations (version) VALUES (1);',
            'INSERT INTO wikione_accounts',
            '(id, username, normalized_username, display_name, password_hash, created_at, updated_at)',
            'VALUES',
            `('00000000-0000-4000-8000-000000000001', '${probeUsername}', '${probeUsername}',`,
            "'Local restore probe', 'synthetic-not-a-credential', now(), now());",
        ].join(' '),
    ]);

    const backupStartedAt = performance.now();
    const backup = dockerPostgres([
        'pg_dump',
        '--username',
        'wikione',
        '--dbname',
        sourceDatabase,
        '--format',
        'custom',
        '--no-owner',
        '--no-privileges',
    ]);
    const backupMilliseconds = performance.now() - backupStartedAt;
    assert.ok(backup.byteLength > 0, 'The PostgreSQL backup is empty.');

    dockerPostgres([
        'createdb',
        '--username',
        'wikione',
        '--template',
        'template0',
        '--encoding',
        'UTF8',
        restoredDatabase,
    ]);
    const restoreStartedAt = performance.now();
    dockerPostgres(
        [
            'pg_restore',
            '--username',
            'wikione',
            '--dbname',
            restoredDatabase,
            '--exit-on-error',
            '--no-owner',
            '--no-privileges',
        ],
        backup,
    );
    const restoreMilliseconds = performance.now() - restoreStartedAt;

    assert.equal(
        queryInteger(
            restoredDatabase,
            `SELECT count(*) FROM wikione_accounts WHERE username = '${probeUsername}' AND password_hash = 'synthetic-not-a-credential'`,
        ),
        1,
        'The synthetic account did not survive backup and restore.',
    );
    assert.equal(
        queryInteger(
            restoredDatabase,
            'SELECT COALESCE(max(version), 0) FROM wikione_schema_migrations',
        ),
        1,
        'The schema migration record did not survive backup and restore.',
    );
    const mainAccountCountAfter = queryInteger(
        'wikione',
        'SELECT count(*) FROM wikione_accounts',
    );
    assert.equal(
        mainAccountCountAfter,
        mainAccountCountBefore,
        'The drill changed the live local account database.',
    );

    evidence = {
        backupBytes: backup.byteLength,
        backupMilliseconds: round(backupMilliseconds),
        restoreMilliseconds: round(restoreMilliseconds),
        mainAccountCountUnchanged: true,
        restoredSchemaMigrationVersion: 1,
        restoredSyntheticAccounts: 1,
        retainedClasses: ['PostgreSQL account schema and durable account rows'],
        excludedClasses: [
            'browser IndexedDB drafts',
            'Redis sessions',
            'Redis preview bundles',
            'rendered HTML and raw wikitext',
        ],
    };
} catch (error) {
    failure = error;
} finally {
    const cleanupErrors: unknown[] = [];
    for (const database of [restoredDatabase, sourceDatabase]) {
        try {
            dockerPostgres([
                'dropdb',
                '--username',
                'wikione',
                '--if-exists',
                '--force',
                database,
            ]);
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    if (cleanupErrors.length > 0) {
        failure = new AggregateError(
            [failure, ...cleanupErrors].filter(
                (value): value is NonNullable<typeof value> =>
                    value !== undefined,
            ),
            'The restore drill failed or could not remove its temporary databases.',
        );
    }
}

const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: failure === undefined ? 'passed' : 'failed',
    scenario:
        'A schema-only clone receives synthetic data, is backed up, restored into an isolated database, verified, and removed.',
    durationMilliseconds: round(performance.now() - startedAt),
    evidence,
    ...(failure === undefined
        ? {}
        : {
              error:
                  failure instanceof Error
                      ? failure.message
                      : 'Unknown backup/restore drill failure.',
          }),
};

if (process.env.LOCAL_RESTORE_REPORT_PATH?.trim()) {
    const output = resolve(process.env.LOCAL_RESTORE_REPORT_PATH.trim());
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 4)}\n`);
}

const output = `${JSON.stringify(report, null, 4)}\n`;
if (failure === undefined) {
    process.stdout.write(output);
} else {
    process.stderr.write(output);
    process.exitCode = 1;
}

function queryInteger(database: string, query: string): number {
    const output = dockerPostgres([
        'psql',
        '--username',
        'wikione',
        '--dbname',
        database,
        '--no-align',
        '--tuples-only',
        '--set',
        'ON_ERROR_STOP=1',
        '--command',
        query,
    ]);
    const value = Number(output.toString('utf8').trim());
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('PostgreSQL returned an invalid integer result.');
    }
    return value;
}

function dockerPostgres(args: readonly string[], input?: Uint8Array): Buffer {
    const result = spawnSync(
        'docker',
        ['compose', 'exec', '-T', 'postgres', ...args],
        {
            input,
            maxBuffer: 16 * 1024 * 1024,
            windowsHide: true,
        },
    );
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const detail = result.stderr.toString('utf8').trim().slice(0, 1_000);
        throw new Error(
            `PostgreSQL container command exited with ${String(result.status)}.${detail ? ` ${detail}` : ''}`,
        );
    }
    return result.stdout;
}

function round(value: number): number {
    return Number(value.toFixed(2));
}
