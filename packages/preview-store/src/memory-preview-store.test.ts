import { describe, expect, it } from 'vitest';

import { MemoryPreviewStore } from './memory-preview-store.js';

const id = 'abcdefghijklmnopqrstuvwxyzABCDEF';
const bundle = {
    html: '<!doctype html><p>Preview</p>',
    wikiBaseUrl: 'https://en.wikipedia.org',
    createdAt: '2026-07-18T00:00:00.000Z',
    expiresAt: '2026-07-18T00:02:00.000Z',
} as const;

describe('MemoryPreviewStore', () => {
    it('returns only unexpired opaque-ID bundles', async () => {
        let now = 1_000;
        const store = new MemoryPreviewStore(() => now);
        await store.put(id, bundle, 500);
        expect(await store.get(id)).toEqual(bundle);
        now = 1_500;
        expect(await store.get(id)).toBeUndefined();
    });

    it('rejects guessable and malformed IDs', () => {
        const store = new MemoryPreviewStore();
        expect(() => store.put('preview-1', bundle, 500)).toThrow('opaque');
    });
});
