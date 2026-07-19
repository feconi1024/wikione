import { randomUUID } from 'node:crypto';

import {
    normalizeUsername,
    validatePassword,
    type PasswordHasher,
} from './password.js';
import {
    equalCsrfToken,
    generateOpaqueToken,
    type SessionPayload,
} from './session-crypto.js';

const defaultIdleMilliseconds = 30 * 60 * 1_000;
const defaultAbsoluteMilliseconds = 8 * 60 * 60 * 1_000;

export interface AccountRecord {
    readonly id: string;
    readonly username: string;
    readonly normalizedUsername: string;
    readonly displayName: string;
    readonly passwordHash: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface AccountRepository {
    readonly create: (account: AccountRecord) => Promise<AccountRecord>;
    readonly findById: (id: string) => Promise<AccountRecord | undefined>;
    readonly findByNormalizedUsername: (
        username: string,
    ) => Promise<AccountRecord | undefined>;
    readonly updateDisplayName: (
        id: string,
        displayName: string,
        updatedAt: string,
    ) => Promise<AccountRecord | undefined>;
    readonly updatePassword: (
        id: string,
        passwordHash: string,
        updatedAt: string,
    ) => Promise<AccountRecord | undefined>;
    readonly delete: (id: string) => Promise<boolean>;
    readonly close: () => Promise<void>;
}

export type SessionLookup =
    | { readonly state: 'active'; readonly payload: SessionPayload }
    | { readonly state: 'retired'; readonly payload: SessionPayload };

export interface SessionRepository {
    readonly save: (
        token: string,
        payload: SessionPayload,
        ttlMilliseconds: number,
    ) => Promise<void>;
    readonly lookup: (token: string) => Promise<SessionLookup | undefined>;
    readonly rotate: (
        oldToken: string,
        newToken: string,
        payload: SessionPayload,
        ttlMilliseconds: number,
    ) => Promise<boolean>;
    readonly deleteToken: (token: string) => Promise<void>;
    readonly deleteFamily: (familyId: string) => Promise<void>;
    readonly deleteAccount: (accountId: string) => Promise<void>;
    readonly close: () => Promise<void>;
}

export interface IssuedSession {
    readonly token: string;
    readonly account: AccountRecord;
    readonly payload: SessionPayload;
}

export interface AuthenticationServiceOptions {
    readonly accounts: AccountRepository;
    readonly sessions: SessionRepository;
    readonly passwordHasher: PasswordHasher;
    readonly now?: () => number;
    readonly createId?: () => string;
    readonly createToken?: () => string;
    readonly idleMilliseconds?: number;
    readonly absoluteMilliseconds?: number;
}

export type AuthenticationErrorCode =
    | 'username-unavailable'
    | 'weak-password'
    | 'invalid-credentials'
    | 'authentication-required'
    | 'invalid-csrf'
    | 'session-expired'
    | 'account-not-found';

export class AuthenticationError extends Error {
    public readonly code: AuthenticationErrorCode;
    public readonly issues: readonly string[];

    public constructor(
        code: AuthenticationErrorCode,
        message: string,
        issues: readonly string[] = [],
    ) {
        super(message);
        this.name = 'AuthenticationError';
        this.code = code;
        this.issues = issues;
    }
}

/** Owns first-party account and session state transitions. */
export class AuthenticationService {
    readonly #accounts: AccountRepository;
    readonly #sessions: SessionRepository;
    readonly #passwordHasher: PasswordHasher;
    readonly #now: () => number;
    readonly #createId: () => string;
    readonly #createToken: () => string;
    readonly #idleMilliseconds: number;
    readonly #absoluteMilliseconds: number;

    public constructor(options: AuthenticationServiceOptions) {
        this.#accounts = options.accounts;
        this.#sessions = options.sessions;
        this.#passwordHasher = options.passwordHasher;
        this.#now = options.now ?? Date.now;
        this.#createId = options.createId ?? randomUUID;
        this.#createToken = options.createToken ?? generateOpaqueToken;
        this.#idleMilliseconds =
            options.idleMilliseconds ?? defaultIdleMilliseconds;
        this.#absoluteMilliseconds =
            options.absoluteMilliseconds ?? defaultAbsoluteMilliseconds;
        assertDuration(this.#idleMilliseconds, 'idle');
        assertDuration(this.#absoluteMilliseconds, 'absolute');
        if (this.#idleMilliseconds > this.#absoluteMilliseconds) {
            throw new RangeError(
                'Session idle expiry cannot exceed absolute expiry.',
            );
        }
    }

    public async register(input: {
        readonly username: string;
        readonly displayName: string;
        readonly password: string;
    }): Promise<IssuedSession> {
        const issues = validatePassword(input.password, input.username);
        if (issues.length > 0) {
            throw new AuthenticationError(
                'weak-password',
                'The password does not meet the security policy.',
                issues,
            );
        }
        const normalizedUsername = normalizeUsername(input.username);
        if (await this.#accounts.findByNormalizedUsername(normalizedUsername)) {
            throw new AuthenticationError(
                'username-unavailable',
                'That username is unavailable.',
            );
        }
        const createdAt = new Date(this.#now()).toISOString();
        const account = await this.#accounts.create({
            id: this.#createId(),
            username: input.username.trim().normalize('NFKC'),
            normalizedUsername,
            displayName: input.displayName.trim().normalize('NFKC'),
            passwordHash: await this.#passwordHasher.hash(input.password),
            createdAt,
            updatedAt: createdAt,
        });
        return this.#issue(account);
    }

    public async login(
        username: string,
        password: string,
    ): Promise<IssuedSession> {
        const account = await this.#accounts.findByNormalizedUsername(
            normalizeUsername(username),
        );
        if (
            !account ||
            !(await this.#passwordHasher.verify(password, account.passwordHash))
        ) {
            throw new AuthenticationError(
                'invalid-credentials',
                'The username or password is incorrect.',
            );
        }
        return this.#issue(account);
    }

    public async authenticate(token: string): Promise<IssuedSession> {
        const lookup = await this.#sessions.lookup(token);
        if (!lookup) {
            throw new AuthenticationError(
                'authentication-required',
                'Sign in to continue.',
            );
        }
        if (lookup.state === 'retired') {
            await this.#sessions.deleteFamily(lookup.payload.familyId);
            throw new AuthenticationError(
                'session-expired',
                'This session was already refreshed. Sign in again.',
            );
        }
        const now = this.#now();
        if (
            Date.parse(lookup.payload.expiresAt) <= now ||
            Date.parse(lookup.payload.absoluteExpiresAt) <= now
        ) {
            await this.#sessions.deleteToken(token);
            throw new AuthenticationError(
                'session-expired',
                'Your session expired. Sign in again.',
            );
        }
        const account = await this.#accounts.findById(lookup.payload.accountId);
        if (!account) {
            await this.#sessions.deleteAccount(lookup.payload.accountId);
            throw new AuthenticationError(
                'account-not-found',
                'This account is no longer available.',
            );
        }
        return { token, account, payload: lookup.payload };
    }

    public async refresh(
        token: string,
        csrfToken: string,
    ): Promise<IssuedSession> {
        const current = await this.authenticate(token);
        this.assertCsrf(current.payload, csrfToken);
        const now = this.#now();
        const absoluteExpiry = Date.parse(current.payload.absoluteExpiresAt);
        const expiresAt = Math.min(
            now + this.#idleMilliseconds,
            absoluteExpiry,
        );
        if (expiresAt <= now) {
            await this.#sessions.deleteToken(token);
            throw new AuthenticationError(
                'session-expired',
                'Your session expired. Sign in again.',
            );
        }
        const newToken = this.#createToken();
        const payload: SessionPayload = {
            ...current.payload,
            csrfToken: this.#createToken(),
            issuedAt: new Date(now).toISOString(),
            expiresAt: new Date(expiresAt).toISOString(),
            generation: current.payload.generation + 1,
        };
        const rotated = await this.#sessions.rotate(
            token,
            newToken,
            payload,
            absoluteExpiry - now,
        );
        if (!rotated) {
            throw new AuthenticationError(
                'session-expired',
                'This session was refreshed elsewhere. Sign in again.',
            );
        }
        return { token: newToken, account: current.account, payload };
    }

    public async logout(token: string, csrfToken: string): Promise<void> {
        const current = await this.authenticate(token);
        this.assertCsrf(current.payload, csrfToken);
        await this.#sessions.deleteToken(token);
    }

    public async logoutAll(token: string, csrfToken: string): Promise<void> {
        const current = await this.authenticate(token);
        this.assertCsrf(current.payload, csrfToken);
        await this.#sessions.deleteAccount(current.account.id);
    }

    public async updateDisplayName(
        token: string,
        csrfToken: string,
        displayName: string,
    ): Promise<AccountRecord> {
        const current = await this.authenticate(token);
        this.assertCsrf(current.payload, csrfToken);
        const account = await this.#accounts.updateDisplayName(
            current.account.id,
            displayName.trim().normalize('NFKC'),
            new Date(this.#now()).toISOString(),
        );
        if (!account) {
            throw new AuthenticationError(
                'account-not-found',
                'This account is no longer available.',
            );
        }
        return account;
    }

    public async changePassword(
        token: string,
        csrfToken: string,
        currentPassword: string,
        newPassword: string,
    ): Promise<IssuedSession> {
        const current = await this.authenticate(token);
        this.assertCsrf(current.payload, csrfToken);
        if (
            !(await this.#passwordHasher.verify(
                currentPassword,
                current.account.passwordHash,
            ))
        ) {
            throw new AuthenticationError(
                'invalid-credentials',
                'The current password is incorrect.',
            );
        }
        const issues = validatePassword(newPassword, current.account.username);
        if (issues.length > 0) {
            throw new AuthenticationError(
                'weak-password',
                'The new password does not meet the security policy.',
                issues,
            );
        }
        const account = await this.#accounts.updatePassword(
            current.account.id,
            await this.#passwordHasher.hash(newPassword),
            new Date(this.#now()).toISOString(),
        );
        if (!account) {
            throw new AuthenticationError(
                'account-not-found',
                'This account is no longer available.',
            );
        }
        await this.#sessions.deleteAccount(account.id);
        return this.#issue(account);
    }

    public async deleteAccount(
        token: string,
        csrfToken: string,
        password: string,
    ): Promise<void> {
        const current = await this.authenticate(token);
        this.assertCsrf(current.payload, csrfToken);
        if (
            !(await this.#passwordHasher.verify(
                password,
                current.account.passwordHash,
            ))
        ) {
            throw new AuthenticationError(
                'invalid-credentials',
                'The password is incorrect.',
            );
        }
        await this.#accounts.delete(current.account.id);
        await this.#sessions.deleteAccount(current.account.id);
    }

    public async close(): Promise<void> {
        await Promise.all([this.#accounts.close(), this.#sessions.close()]);
    }

    public assertCsrf(payload: SessionPayload, csrfToken: string): void {
        if (!equalCsrfToken(csrfToken, payload.csrfToken)) {
            throw new AuthenticationError(
                'invalid-csrf',
                'The security token is missing or invalid.',
            );
        }
    }

    async #issue(account: AccountRecord): Promise<IssuedSession> {
        const now = this.#now();
        const token = this.#createToken();
        const payload: SessionPayload = {
            accountId: account.id,
            familyId: this.#createToken(),
            csrfToken: this.#createToken(),
            issuedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + this.#idleMilliseconds).toISOString(),
            absoluteExpiresAt: new Date(
                now + this.#absoluteMilliseconds,
            ).toISOString(),
            generation: 0,
        };
        await this.#sessions.save(token, payload, this.#absoluteMilliseconds);
        return { token, account, payload };
    }
}

function assertDuration(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError(
            `Session ${label} expiry must be a positive integer.`,
        );
    }
}
