import { describe, expect, it } from 'vitest';

import { analyzeWikitext } from './analysis.js';

describe('analyzeWikitext', () => {
    it('extracts a navigable section outline', () => {
        const analysis = analyzeWikitext(
            'Lead\n== History ==\nText\n=== Details ===\nMore',
        );
        expect(analysis.sections).toEqual([
            { level: 2, title: 'History', from: 5, to: 18 },
            { level: 3, title: 'Details', from: 24, to: 39 },
        ]);
    });

    it('reports incomplete nested constructs while the user types', () => {
        const analysis = analyzeWikitext(
            '{{Infobox|name=[[Earth]\n{| class="wikitable"\n| Row',
        );
        expect(analysis.diagnostics.map((item) => item.code)).toEqual([
            'unclosed-template',
            'unclosed-link',
            'unclosed-table',
        ]);
    });

    it('does not parse delimiters inside comments and opaque tags', () => {
        const analysis = analyzeWikitext(
            '<!-- {{ ignored -->\n<nowiki>[[also ignored]]</nowiki>\n{{ok}}',
        );
        expect(analysis.diagnostics).toEqual([]);
    });

    it('handles arbitrary Unicode without throwing', () => {
        const samples = [
            '萌娘百科 {{角色',
            'ويكيبيديا [[صفحة]]',
            '🌍\u0000{{{x}}}',
        ];
        for (const sample of samples) {
            expect(() => analyzeWikitext(sample)).not.toThrow();
        }
    });
});
