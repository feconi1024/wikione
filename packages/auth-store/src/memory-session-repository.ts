import {
    decryptSessionPayload,
    encryptSessionPayload,
    hashOpaqueToken,
    type SessionKeyRing,
    type SessionLookup,
    type SessionPayload,
    type SessionRepository,
} from '@wikione/auth-core';

interface StoredSession {
    readonly state: 'active' | 'retired';
    readonly envelope: string;
    readonly expiresAt: number;
}

export class MemorySessionRepository implements SessionRepository {
    readonly #sessions = new Map<string, StoredSession>();
    readonly #keyRing: SessionKeyRing;
    readonly #now: () => number;

    public constructor(keyRing: SessionKeyRing, now: () => number = Date.now) {
        this.#keyRing = keyRing;
        this.#now = now;
    }

    public save(
        token: string,
        payload: SessionPayload,
        ttlMilliseconds: number,
    ): Promise<void> {
        this.#sessions.set(hashOpaqueToken(token, this.#keyRing), {
            state: 'active',
            envelope: encryptSessionPayload(payload, this.#keyRing),
            expiresAt: this.#now() + ttlMilliseconds,
        });
        return Promise.resolve();
    }

    public lookup(token: string): Promise<SessionLookup | undefined> {
        const key = hashOpaqueToken(token, this.#keyRing);
        const stored = this.#sessions.get(key);
        if (!stored || stored.expiresAt <= this.#now()) {
            this.#sessions.delete(key);
            return Promise.resolve(undefined);
        }
        const payload = decryptSessionPayload(stored.envelope, this.#keyRing);
        return Promise.resolve(
            payload ? { state: stored.state, payload } : undefined,
        );
    }

    public async rotate(
        oldToken: string,
        newToken: string,
        payload: SessionPayload,
        ttlMilliseconds: number,
    ): Promise<boolean> {
        const oldKey = hashOpaqueToken(oldToken, this.#keyRing);
        const old = this.#sessions.get(oldKey);
        if (!old || old.state !== 'active') {
            return false;
        }
        this.#sessions.set(oldKey, { ...old, state: 'retired' });
        await this.save(newToken, payload, ttlMilliseconds);
        return true;
    }

    public deleteToken(token: string): Promise<void> {
        this.#sessions.delete(hashOpaqueToken(token, this.#keyRing));
        return Promise.resolve();
    }

    public async deleteFamily(familyId: string): Promise<void> {
        await this.#deleteMatching((payload) => payload.familyId === familyId);
    }

    public async deleteAccount(accountId: string): Promise<void> {
        await this.#deleteMatching(
            (payload) => payload.accountId === accountId,
        );
    }

    public close(): Promise<void> {
        this.#sessions.clear();
        return Promise.resolve();
    }

    #deleteMatching(
        predicate: (payload: SessionPayload) => boolean,
    ): Promise<void> {
        for (const [key, stored] of this.#sessions) {
            const payload = decryptSessionPayload(
                stored.envelope,
                this.#keyRing,
            );
            if (payload && predicate(payload)) {
                this.#sessions.delete(key);
            }
        }
        return Promise.resolve();
    }
}
