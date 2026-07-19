import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
    timingSafeEqual,
} from 'node:crypto';

const envelopeVersion = 'v1';

export interface SessionKeyRing {
    readonly activeKeyId: string;
    readonly encryptionKeys: Readonly<Record<string, Buffer>>;
    readonly lookupHmacKey: Buffer;
}

export interface SessionPayload {
    readonly accountId: string;
    readonly familyId: string;
    readonly csrfToken: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly absoluteExpiresAt: string;
    readonly generation: number;
}

export function generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(
    token: string,
    keyRing: SessionKeyRing,
): string {
    assertOpaqueToken(token);
    return hashLookupValue(token, keyRing);
}

/** HMACs non-secret index material without imposing the browser-token shape. */
export function hashLookupValue(
    value: string,
    keyRing: SessionKeyRing,
): string {
    assertKeyRing(keyRing);
    return createHmac('sha256', keyRing.lookupHmacKey)
        .update(value, 'utf8')
        .digest('base64url');
}

export function encryptSessionPayload(
    payload: SessionPayload,
    keyRing: SessionKeyRing,
): string {
    assertKeyRing(keyRing);
    assertSessionPayload(payload);
    const key = keyRing.encryptionKeys[keyRing.activeKeyId];
    if (!key) {
        throw new TypeError(
            'The active session encryption key is unavailable.',
        );
    }
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, initializationVector);
    cipher.setAAD(Buffer.from(`${envelopeVersion}:${keyRing.activeKeyId}`));
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(payload), 'utf8'),
        cipher.final(),
    ]);
    return [
        envelopeVersion,
        keyRing.activeKeyId,
        initializationVector.toString('base64url'),
        ciphertext.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
    ].join('.');
}

export function decryptSessionPayload(
    envelope: string,
    keyRing: SessionKeyRing,
): SessionPayload | undefined {
    assertKeyRing(keyRing);
    const [version, keyId, encodedIv, encodedCiphertext, encodedTag] =
        envelope.split('.');
    if (
        version !== envelopeVersion ||
        !keyId ||
        !encodedIv ||
        !encodedCiphertext ||
        !encodedTag
    ) {
        return undefined;
    }
    const key = keyRing.encryptionKeys[keyId];
    if (!key) {
        return undefined;
    }
    try {
        const initializationVector = Buffer.from(encodedIv, 'base64url');
        const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
        const tag = Buffer.from(encodedTag, 'base64url');
        if (initializationVector.length !== 12 || tag.length !== 16) {
            return undefined;
        }
        const decipher = createDecipheriv(
            'aes-256-gcm',
            key,
            initializationVector,
        );
        decipher.setAAD(Buffer.from(`${version}:${keyId}`));
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]).toString('utf8');
        const payload = JSON.parse(plaintext) as unknown;
        return isSessionPayload(payload) ? payload : undefined;
    } catch {
        return undefined;
    }
}

export function equalCsrfToken(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
    );
}

export function readSessionKeyRing(input: {
    readonly activeKeyId: string;
    readonly encryptionKeyBase64: string;
    readonly lookupHmacKeyBase64: string;
}): SessionKeyRing {
    const encryptionKey = Buffer.from(input.encryptionKeyBase64, 'base64');
    const lookupHmacKey = Buffer.from(input.lookupHmacKeyBase64, 'base64');
    const keyRing: SessionKeyRing = {
        activeKeyId: input.activeKeyId,
        encryptionKeys: { [input.activeKeyId]: encryptionKey },
        lookupHmacKey,
    };
    assertKeyRing(keyRing);
    return keyRing;
}

function assertOpaqueToken(token: string): void {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) {
        throw new TypeError('Session tokens must be 256-bit base64url values.');
    }
}

function assertKeyRing(keyRing: SessionKeyRing): void {
    const activeKey = keyRing.encryptionKeys[keyRing.activeKeyId];
    if (
        !/^[A-Za-z0-9_-]{1,32}$/u.test(keyRing.activeKeyId) ||
        !activeKey ||
        activeKey.length !== 32 ||
        keyRing.lookupHmacKey.length !== 32
    ) {
        throw new TypeError('Session keys must be named 256-bit keys.');
    }
}

function assertSessionPayload(payload: SessionPayload): void {
    if (!isSessionPayload(payload)) {
        throw new TypeError('Invalid session payload.');
    }
}

function isSessionPayload(value: unknown): value is SessionPayload {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value as Readonly<Record<string, unknown>>;
    return (
        typeof record.accountId === 'string' &&
        typeof record.familyId === 'string' &&
        typeof record.csrfToken === 'string' &&
        /^[A-Za-z0-9_-]{43}$/u.test(record.csrfToken) &&
        typeof record.issuedAt === 'string' &&
        typeof record.expiresAt === 'string' &&
        typeof record.absoluteExpiresAt === 'string' &&
        typeof record.generation === 'number' &&
        Number.isSafeInteger(record.generation) &&
        record.generation >= 0
    );
}
