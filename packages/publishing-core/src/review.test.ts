import { describe, expect, it } from 'vitest';

import { createReviewModel } from './review.js';

describe('line review model', () => {
    it('counts additions and deletions while retaining line numbers', () => {
        const review = createReviewModel(
            '== Earth ==\nOld text\nShared\n',
            '== Earth ==\nNew text\nShared\nAdded\n',
        );

        expect(review).toMatchObject({
            additions: 2,
            deletions: 1,
            changed: true,
            truncated: false,
        });
        expect(review.lines).toEqual(
            expect.arrayContaining([
                { kind: 'deletion', text: 'Old text', oldLine: 2 },
                { kind: 'addition', text: 'New text', newLine: 2 },
                {
                    kind: 'context',
                    text: 'Shared',
                    oldLine: 3,
                    newLine: 3,
                },
            ]),
        );
    });

    it('normalizes CRLF and preserves CJK/template text as plain text', () => {
        const review = createReviewModel(
            '{{信息框|名称=旧}}\r\n中文\r\n',
            '{{信息框|名称=新}}\n中文\n',
        );
        expect(review.additions).toBe(1);
        expect(review.deletions).toBe(1);
        expect(review.lines.map((line) => line.text)).toContain(
            '{{信息框|名称=新}}',
        );
    });
});
