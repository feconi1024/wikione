import { createClient } from 'redis';

import {
    decryptSessionPayload,
    encryptSessionPayload,
    hashLookupValue,
    hashOpaqueToken,
    type SessionKeyRing,
    type SessionLookup,
    type SessionPayload,
    type SessionRepository,
} from '@wikione/auth-core';

const prefix = 'wikione:auth:';

export class RedisSessionRepository implements SessionRepository {
    readonly #client: ReturnType<typeof createClient>;
    readonly #keyRing: SessionKeyRing;

    private constructor(
        client: ReturnType<typeof createClient>,
        keyRing: SessionKeyRing,
    ) {
        this.#client = client;
        this.#keyRing = keyRing;
    }

    public static async connect(
        url: string,
        keyRing: SessionKeyRing,
    ): Promise<RedisSessionRepository> {
        const parsed = new URL(url);
        if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
            throw new TypeError('REDIS_URL must use redis:// or rediss://.');
        }
        const client = createClient({ url });
        client.on('error', () => {
            // The API owns availability logs. Session data is never logged here.
        });
        await client.connect();
        return new RedisSessionRepository(client, keyRing);
    }

    public async ready(): Promise<void> {
        if ((await this.#client.ping()) !== 'PONG') {
            throw new Error('Redis session readiness check failed.');
        }
    }

    public async save(
        token: string,
        payload: SessionPayload,
        ttlMilliseconds: number,
    ): Promise<void> {
        const lookup = hashOpaqueToken(token, this.#keyRing);
        const transaction = this.#client.multi();
        transaction.set(
            this.#sessionKey(lookup),
            `active.${encryptSessionPayload(payload, this.#keyRing)}`,
            { PX: ttlMilliseconds },
        );
        transaction.sAdd(this.#accountKey(payload.accountId), lookup);
        transaction.pExpire(
            this.#accountKey(payload.accountId),
            ttlMilliseconds,
        );
        transaction.sAdd(this.#familyKey(payload.familyId), lookup);
        transaction.pExpire(this.#familyKey(payload.familyId), ttlMilliseconds);
        await transaction.exec();
    }

    public async lookup(token: string): Promise<SessionLookup | undefined> {
        const value = await this.#client.get(
            this.#sessionKey(hashOpaqueToken(token, this.#keyRing)),
        );
        if (!value) {
            return undefined;
        }
        const separator = value.indexOf('.');
        const state = value.slice(0, separator);
        const payload = decryptSessionPayload(
            value.slice(separator + 1),
            this.#keyRing,
        );
        return payload && (state === 'active' || state === 'retired')
            ? { state, payload }
            : undefined;
    }

    public async rotate(
        oldToken: string,
        newToken: string,
        payload: SessionPayload,
        ttlMilliseconds: number,
    ): Promise<boolean> {
        const oldLookup = hashOpaqueToken(oldToken, this.#keyRing);
        const newLookup = hashOpaqueToken(newToken, this.#keyRing);
        const envelope = encryptSessionPayload(payload, this.#keyRing);
        const result = await this.#client.eval(
            `
                local current = redis.call('GET', KEYS[1])
                if (not current) or string.sub(current, 1, 7) ~= 'active.' then
                    return 0
                end
                redis.call('SET', KEYS[1], 'retired.' .. string.sub(current, 8), 'PX', ARGV[1])
                redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[1])
                redis.call('SADD', KEYS[3], ARGV[3])
                redis.call('PEXPIRE', KEYS[3], ARGV[1])
                redis.call('SADD', KEYS[4], ARGV[3])
                redis.call('PEXPIRE', KEYS[4], ARGV[1])
                return 1
            `,
            {
                keys: [
                    this.#sessionKey(oldLookup),
                    this.#sessionKey(newLookup),
                    this.#accountKey(payload.accountId),
                    this.#familyKey(payload.familyId),
                ],
                arguments: [
                    String(ttlMilliseconds),
                    `active.${envelope}`,
                    newLookup,
                ],
            },
        );
        return result === 1;
    }

    public async deleteToken(token: string): Promise<void> {
        await this.#client.del(
            this.#sessionKey(hashOpaqueToken(token, this.#keyRing)),
        );
    }

    public async deleteFamily(familyId: string): Promise<void> {
        await this.#deleteIndex(this.#familyKey(familyId));
    }

    public async deleteAccount(accountId: string): Promise<void> {
        await this.#deleteIndex(this.#accountKey(accountId));
    }

    public async close(): Promise<void> {
        if (this.#client.isOpen) {
            await this.#client.quit();
        }
    }

    async #deleteIndex(indexKey: string): Promise<void> {
        const lookups = await this.#client.sMembers(indexKey);
        if (lookups.length > 0) {
            await this.#client.del(
                lookups.map((lookup) => this.#sessionKey(lookup)),
            );
        }
        await this.#client.del(indexKey);
    }

    #sessionKey(lookup: string): string {
        return `${prefix}session:${lookup}`;
    }

    #accountKey(accountId: string): string {
        return `${prefix}account:${hashLookupValue(`account:${accountId}`, this.#keyRing)}`;
    }

    #familyKey(familyId: string): string {
        return `${prefix}family:${hashLookupValue(`family:${familyId}`, this.#keyRing)}`;
    }
}
