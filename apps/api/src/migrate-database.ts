import { bootstrapPostgresDatabase } from '@wikione/auth-store';

import { readDatabaseMigrationConfig } from './database-migration-config.js';

try {
    await bootstrapPostgresDatabase(readDatabaseMigrationConfig());
    process.stdout.write('{"event":"database-migration-complete"}\n');
} catch {
    process.stderr.write('{"event":"database-migration-failed"}\n');
    process.exitCode = 1;
}
