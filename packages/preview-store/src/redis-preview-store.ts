import { createClient } from 'redis';

import {
    assertPreviewBundleId,
    isPreviewBundle,
    type PreviewBundle,
    type PreviewStore,
} from './preview-store.js';

const keyPrefix = 'wikione:preview:';

export class RedisPreviewStore implements PreviewStore {
    readonly #client: ReturnType<typeof createClient>;

    private constructor(client: ReturnType<typeof createClient>) {
        this.#client = client;
    }

    public static async connect(url: string): Promise<RedisPreviewStore> {
        const parsedUrl = new URL(url);
        if (
            parsedUrl.protocol !== 'redis:' &&
            parsedUrl.protocol !== 'rediss:'
        ) {
            throw new TypeError('REDIS_URL must use redis:// or rediss://.');
        }
        const client = createClient({ url });
        client.on('error', () => {
            // The calling service owns availability reporting. Never log bundle data here.
        });
        await client.connect();
        return new RedisPreviewStore(client);
    }

    public async put(
        id: string,
        bundle: PreviewBundle,
        ttlMilliseconds: number,
    ): Promise<void> {
        assertPreviewBundleId(id);
        if (!Number.isSafeInteger(ttlMilliseconds) || ttlMilliseconds < 1) {
            throw new RangeError('Preview TTL must be a positive integer.');
        }
        await this.#client.set(`${keyPrefix}${id}`, JSON.stringify(bundle), {
            PX: ttlMilliseconds,
        });
    }

    public async get(id: string): Promise<PreviewBundle | undefined> {
        assertPreviewBundleId(id);
        const value = await this.#client.get(`${keyPrefix}${id}`);
        if (!value) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(value) as unknown;
            return isPreviewBundle(parsed) ? parsed : undefined;
        } catch {
            return undefined;
        }
    }

    public async close(): Promise<void> {
        if (this.#client.isOpen) {
            await this.#client.quit();
        }
    }
}
