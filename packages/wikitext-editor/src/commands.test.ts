import { describe, expect, it } from 'vitest';

import { applyWikitextCommand } from './commands.js';

describe('applyWikitextCommand', () => {
    it('wraps a selection and preserves the selected range', () => {
        expect(
            applyWikitextCommand('Earth is round', { from: 0, to: 5 }, 'bold'),
        ).toEqual({
            source: "'''Earth''' is round",
            selection: { from: 3, to: 8 },
        });
    });

    it('inserts friendly placeholders for empty selections', () => {
        const result = applyWikitextCommand(
            '',
            { from: 0, to: 0 },
            'internal-link',
        );
        expect(result.source).toBe('[[Page title]]');
        expect(result.selection).toEqual({ from: 2, to: 12 });
    });

    it('prefixes each selected list line', () => {
        expect(
            applyWikitextCommand(
                'First\nSecond',
                { from: 0, to: 12 },
                'bullet-list',
            ).source,
        ).toBe('* First\n* Second');
    });
});
