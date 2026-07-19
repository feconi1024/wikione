import { describe, expect, it } from 'vitest';

import { mergeDocuments, resolveMerge } from './merge.js';

describe('three-way wikitext merge', () => {
    it('automatically combines non-overlapping changes', () => {
        const result = mergeDocuments(
            'Heading\nBase middle\nFooter\n',
            'My heading\nBase middle\nFooter\n',
            'Heading\nBase middle\nRemote footer\n',
        );
        expect(result.conflictCount).toBe(0);
        expect(result.mergedSource).toBe(
            'My heading\nBase middle\nRemote footer\n',
        );
    });

    it('exposes overlapping changes and requires an explicit resolution', () => {
        const result = mergeDocuments(
            'Before\nShared value\nAfter\n',
            'Before\nMy value\nAfter\n',
            'Before\nRemote value\nAfter\n',
        );
        expect(result.conflictCount).toBe(1);
        expect(result.mergedSource).toBeUndefined();
        expect(() => resolveMerge(result, {})).toThrow(/unresolved/u);
        expect(resolveMerge(result, { 0: { choice: 'ours' } })).toBe(
            'Before\nMy value\nAfter\n',
        );
        expect(
            resolveMerge(result, {
                0: { choice: 'manual', source: 'Combined value' },
            }),
        ).toBe('Before\nCombined value\nAfter\n');
    });

    it('handles create collisions, deletions, CRLF, and CJK text', () => {
        expect(
            mergeDocuments('', '我的页面\r\n', '远程页面\n').conflictCount,
        ).toBe(1);
        const deletion = mergeDocuments(
            'Heading\nKeep\nDelete me\n',
            'Heading\nKeep\n',
            'Remote heading\nKeep\nDelete me\n',
        );
        expect(deletion.conflictCount).toBe(0);
        expect(deletion.mergedSource).toBe('Remote heading\nKeep\n');
    });
});
