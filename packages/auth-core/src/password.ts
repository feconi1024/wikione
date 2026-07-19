import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const algorithm = 'scrypt';
const derivedKeyLength = 32;
const defaultParameters: ScryptParameters = {
    cost: 131_072,
    blockSize: 8,
    parallelization: 1,
    maxMemory: 256 * 1024 * 1024,
};

export interface ScryptParameters {
    readonly cost: number;
    readonly blockSize: number;
    readonly parallelization: number;
    readonly maxMemory: number;
}

export interface PasswordHasher {
    readonly hash: (password: string) => Promise<string>;
    readonly verify: (
        password: string,
        encodedHash: string,
    ) => Promise<boolean>;
}

/** Normalizes a username for a database uniqueness constraint. */
export function normalizeUsername(username: string): string {
    return username.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

/** Applies the server-side password policy without retaining the password. */
export function validatePassword(
    password: string,
    username?: string,
): readonly string[] {
    const issues: string[] = [];
    const byteLength = Buffer.byteLength(password, 'utf8');
    if (password.length < 12) {
        issues.push('Use at least 12 characters.');
    }
    if (byteLength > 128) {
        issues.push('Use no more than 128 UTF-8 bytes.');
    }
    if (
        username &&
        normalizeUsername(password).includes(normalizeUsername(username))
    ) {
        issues.push('Do not include your username in your password.');
    }
    return issues;
}

/** Creates an OWASP-compatible scrypt password hasher. */
export function createPasswordHasher(
    parameters: ScryptParameters = defaultParameters,
): PasswordHasher {
    assertScryptParameters(parameters);
    return {
        async hash(password) {
            assertPasswordInput(password);
            const salt = randomBytes(16);
            const derivedKey = await derive(password, salt, parameters);
            return [
                '',
                algorithm,
                `n=${String(parameters.cost)},r=${String(parameters.blockSize)},p=${String(parameters.parallelization)}`,
                salt.toString('base64url'),
                derivedKey.toString('base64url'),
            ].join('$');
        },
        async verify(password, encodedHash) {
            if (Buffer.byteLength(password, 'utf8') > 128) {
                return false;
            }
            const parsed = parseEncodedHash(encodedHash);
            if (!parsed) {
                return false;
            }
            const derivedKey = await derive(
                password,
                parsed.salt,
                parsed.parameters,
            );
            return timingSafeEqual(derivedKey, parsed.derivedKey);
        },
    };
}

function derive(
    password: string,
    salt: Buffer,
    parameters: ScryptParameters,
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(
            password,
            salt,
            derivedKeyLength,
            {
                N: parameters.cost,
                r: parameters.blockSize,
                p: parameters.parallelization,
                maxmem: parameters.maxMemory,
            },
            (error, derivedKey) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(derivedKey);
                }
            },
        );
    });
}

function parseEncodedHash(encodedHash: string):
    | {
          readonly parameters: ScryptParameters;
          readonly salt: Buffer;
          readonly derivedKey: Buffer;
      }
    | undefined {
    const parts = encodedHash.split('$');
    if (parts.length !== 5 || parts[0] !== '' || parts[1] !== algorithm) {
        return undefined;
    }
    const match = /^n=(\d+),r=(\d+),p=(\d+)$/u.exec(parts[2] ?? '');
    if (!match) {
        return undefined;
    }
    const parameters: ScryptParameters = {
        cost: Number(match[1]),
        blockSize: Number(match[2]),
        parallelization: Number(match[3]),
        maxMemory: 256 * 1024 * 1024,
    };
    try {
        assertScryptParameters(parameters);
        const salt = Buffer.from(parts[3] ?? '', 'base64url');
        const derivedKey = Buffer.from(parts[4] ?? '', 'base64url');
        return salt.length === 16 && derivedKey.length === derivedKeyLength
            ? { parameters, salt, derivedKey }
            : undefined;
    } catch {
        return undefined;
    }
}

function assertPasswordInput(password: string): void {
    if (!password || Buffer.byteLength(password, 'utf8') > 128) {
        throw new RangeError(
            'Password input is empty or exceeds 128 UTF-8 bytes.',
        );
    }
}

function assertScryptParameters(parameters: ScryptParameters): void {
    if (
        !Number.isSafeInteger(parameters.cost) ||
        parameters.cost < 1_024 ||
        (parameters.cost & (parameters.cost - 1)) !== 0 ||
        !Number.isSafeInteger(parameters.blockSize) ||
        parameters.blockSize < 1 ||
        !Number.isSafeInteger(parameters.parallelization) ||
        parameters.parallelization < 1 ||
        !Number.isSafeInteger(parameters.maxMemory) ||
        parameters.maxMemory < 16 * 1024 * 1024
    ) {
        throw new RangeError('Invalid scrypt parameters.');
    }
}
