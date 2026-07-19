import { createDraftKey, type LocalDraft } from '@wikione/editor-core';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { IndexedDbDraftStore } from './draft-store.js';

describe('IndexedDbDraftStore', () => {
    it('saves, restores, and explicitly deletes source-only drafts', async () => {
        const store = new IndexedDbDraftStore(new IDBFactory());
        const draft: LocalDraft = {
            version: 1,
            key: createDraftKey('en-wikipedia', 'Earth'),
            wikiId: 'en-wikipedia',
            title: 'Earth',
            source: 'Draft source',
            baseSource: 'Original source',
            baseRevision: {
                id: 42,
                timestamp: '2026-07-18T00:00:00.000Z',
            },
            updatedAt: '2026-07-18T00:10:00.000Z',
        };

        await store.save(draft);
        expect(await store.get('en-wikipedia', 'Earth')).toEqual(draft);
        await store.delete('en-wikipedia', 'Earth');
        expect(await store.get('en-wikipedia', 'Earth')).toBeUndefined();
    });
});
