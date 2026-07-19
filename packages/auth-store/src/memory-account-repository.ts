import type { AccountRecord, AccountRepository } from '@wikione/auth-core';

export class AccountConflictError extends Error {
    public constructor() {
        super('The normalized username already exists.');
        this.name = 'AccountConflictError';
    }
}

export class MemoryAccountRepository implements AccountRepository {
    readonly #accounts = new Map<string, AccountRecord>();

    public async create(account: AccountRecord): Promise<AccountRecord> {
        if (await this.findByNormalizedUsername(account.normalizedUsername)) {
            throw new AccountConflictError();
        }
        this.#accounts.set(account.id, account);
        return account;
    }

    public findById(id: string): Promise<AccountRecord | undefined> {
        return Promise.resolve(this.#accounts.get(id));
    }

    public findByNormalizedUsername(
        username: string,
    ): Promise<AccountRecord | undefined> {
        return Promise.resolve(
            [...this.#accounts.values()].find(
                (account) => account.normalizedUsername === username,
            ),
        );
    }

    public updateDisplayName(
        id: string,
        displayName: string,
        updatedAt: string,
    ): Promise<AccountRecord | undefined> {
        return Promise.resolve(this.#update(id, { displayName, updatedAt }));
    }

    public updatePassword(
        id: string,
        passwordHash: string,
        updatedAt: string,
    ): Promise<AccountRecord | undefined> {
        return Promise.resolve(this.#update(id, { passwordHash, updatedAt }));
    }

    public delete(id: string): Promise<boolean> {
        return Promise.resolve(this.#accounts.delete(id));
    }

    public close(): Promise<void> {
        // In-memory test state owns no external resources.
        return Promise.resolve();
    }

    #update(
        id: string,
        patch: Partial<AccountRecord>,
    ): AccountRecord | undefined {
        const account = this.#accounts.get(id);
        if (!account) {
            return undefined;
        }
        const updated = { ...account, ...patch };
        this.#accounts.set(id, updated);
        return updated;
    }
}
