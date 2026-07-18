import { describe, expect, it } from 'vitest';

import { tokenizeWikitext } from './tokens.js';

describe('tokenizeWikitext', () => {
    it('is lossless across multilingual and nested source', () => {
        const source =
            '== 概要 ==\n{{Infobox|name=[[地球]]}}\n<ref>مرجع</ref>\nhttps://example.test';
        const tokens = tokenizeWikitext(source);
        expect(
            tokens.map((token) => source.slice(token.from, token.to)).join(''),
        ).toBe(source);
        expect(tokens.map((token) => token.kind)).toContain('template-brace');
        expect(tokens.map((token) => token.kind)).toContain(
            'internal-link-bracket',
        );
        expect(tokens.map((token) => token.kind)).toContain('url');
    });

    it('keeps opaque extension content in one safe token', () => {
        const source =
            '<syntaxhighlight lang="js">{{not a template}}</syntaxhighlight>';
        expect(tokenizeWikitext(source)).toEqual([
            { kind: 'opaque-tag', from: 0, to: source.length },
        ]);
    });

    it('always advances on malformed input', () => {
        const source = '\u0000{[<\n===\n}}}';
        const tokens = tokenizeWikitext(source);
        expect(tokens[0]?.from).toBe(0);
        expect(tokens.at(-1)?.to).toBe(source.length);
        for (const token of tokens) {
            expect(token.to).toBeGreaterThan(token.from);
        }
    });
});
