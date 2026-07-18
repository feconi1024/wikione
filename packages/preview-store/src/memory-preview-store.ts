import {
    assertPreviewBundleId,
    type PreviewBundle,
    type PreviewStore,
} from './preview-store.js';

interface StoredBundle {
    readonly bundle: PreviewBundle;
    readonly expiresAtMilliseconds: number;
}

export class MemoryPreviewStore implements PreviewStore {
    readonly #bundles = new Map<string, StoredBundle>();
    readonly #now: () => number;

    public constructor(now: () => number = Date.now) {
        this.#now = now;
    }

    public put(
        id: string,
        bundle: PreviewBundle,
        ttlMilliseconds: number,
    ): Promise<void> {
        assertPreviewBundleId(id);
        if (!Number.isSafeInteger(ttlMilliseconds) || ttlMilliseconds < 1) {
            throw new RangeError('Preview TTL must be a positive integer.');
        }
        this.#bundles.set(id, {
            bundle,
            expiresAtMilliseconds: this.#now() + ttlMilliseconds,
        });
        return Promise.resolve();
    }

    public get(id: string): Promise<PreviewBundle | undefined> {
        assertPreviewBundleId(id);
        const stored = this.#bundles.get(id);
        if (!stored) {
            return Promise.resolve(undefined);
        }
        if (stored.expiresAtMilliseconds <= this.#now()) {
            this.#bundles.delete(id);
            return Promise.resolve(undefined);
        }
        return Promise.resolve(stored.bundle);
    }

    public close(): Promise<void> {
        this.#bundles.clear();
        return Promise.resolve();
    }
}
