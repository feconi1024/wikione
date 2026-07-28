export interface DatabaseMigrationConfig {
    readonly applicationPassword: string;
    readonly applicationUser: string;
    readonly bootstrapUrl: string;
}

/** Reads only the values needed by the short-lived database migration task. */
export function readDatabaseMigrationConfig(
    environment: NodeJS.ProcessEnv = process.env,
): DatabaseMigrationConfig {
    const host = requireValue(environment, 'DATABASE_HOST');
    const port = requireValue(environment, 'DATABASE_PORT');
    const name = requireIdentifier(environment, 'DATABASE_NAME');
    const bootstrapUser = requireIdentifier(
        environment,
        'DATABASE_BOOTSTRAP_USER',
    );
    const bootstrapPassword = requireSecret(
        environment,
        'DATABASE_BOOTSTRAP_PASSWORD',
    );
    const applicationUser = requireIdentifier(environment, 'DATABASE_USER');
    const applicationPassword = requireSecret(environment, 'DATABASE_PASSWORD');

    if (!/^[A-Za-z0-9.-]+$/u.test(host)) {
        throw new TypeError(
            'DATABASE_HOST must be a DNS name or IPv4 address.',
        );
    }
    const portNumber = Number(port);
    if (
        !Number.isSafeInteger(portNumber) ||
        portNumber < 1 ||
        portNumber > 65_535
    ) {
        throw new TypeError('DATABASE_PORT must be a valid TCP port.');
    }

    const url = new URL('postgresql://placeholder/placeholder');
    url.hostname = host;
    url.port = String(portNumber);
    url.username = bootstrapUser;
    url.password = bootstrapPassword;
    url.pathname = `/${name}`;
    if (environment.NODE_ENV === 'production') {
        url.searchParams.set('sslmode', 'require');
    }
    return {
        applicationPassword,
        applicationUser,
        bootstrapUrl: url.toString(),
    };
}

function requireValue(environment: NodeJS.ProcessEnv, name: string): string {
    const value = environment[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required for database migration.`);
    }
    return value;
}

function requireIdentifier(
    environment: NodeJS.ProcessEnv,
    name: string,
): string {
    const value = requireValue(environment, name);
    if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value)) {
        throw new TypeError(`${name} must be a safe PostgreSQL identifier.`);
    }
    return value;
}

function requireSecret(environment: NodeJS.ProcessEnv, name: string): string {
    const value = environment[name];
    if (!value) {
        throw new Error(`${name} is required for database migration.`);
    }
    return value;
}
