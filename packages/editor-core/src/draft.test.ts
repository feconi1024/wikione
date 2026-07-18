import { describe, expect, it } from 'vitest';

import { createDraftKey, isLocalDraft, normalizeDraftTitle } from './draft.js';

describe('local draft identity', () => {
    it('normalizes whitespace without changing title case', () => {
        expect(normalizeDraftTitle('  User:Example__Sandbox  ')).toBe(
            'User:Example Sandbox',
        );
        expect(createDraftKey('en-wikipedia', 'Earth')).not.toBe(
            createDraftKey('en-wikipedia', 'earth'),
        );
    });

    it('rejects corrupt or obsolete draft records', () => {
        expect(
            isLocalDraft({
                version: 1,
                key: createDraftKey('en-wikipedia', 'Earth'),
                wikiId: 'en-wikipedia',
                title: 'Earth',
                source: 'Text',
                updatedAt: '2026-07-18T00:00:00.000Z',
            }),
        ).toBe(true);
        expect(isLocalDraft({ version: 0 })).toBe(false);
        expect(isLocalDraft({ version: 1, source: 42 })).toBe(false);
    });
});
