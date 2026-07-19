import { describe, expect, it, vi } from 'vitest';

import {
    DisabledWikiPublisher,
    executeVerifiedPublish,
    normalizeProviderError,
    type WikiPublisher,
} from './provider.js';

const input = {
    title: 'Earth',
    source: 'New source',
    summary: 'Improve introduction',
    minor: false,
    watchlist: 'preferences' as const,
    editingStartedAt: '2026-07-19T00:00:00.000Z',
};

describe('publisher orchestration', () => {
    it('uses create-only semantics and verifies exact created source', async () => {
        const publisher: WikiPublisher = {
            submitEdit: vi.fn().mockResolvedValue({
                status: 'submitted',
                newRevisionId: 42,
            }),
            getRevisionSource: vi.fn().mockResolvedValue({
                revisionId: 42,
                source: input.source,
            }),
        };
        await expect(executeVerifiedPublish(publisher, input)).resolves.toEqual(
            {
                status: 'verified',
                newRevisionId: 42,
            },
        );
        expect(publisher.submitEdit).toHaveBeenCalledWith(
            expect.objectContaining({ operation: 'create', createOnly: true }),
        );
    });

    it('passes update revision guards and fails closed on verification mismatch', async () => {
        const publisher: WikiPublisher = {
            submitEdit: vi.fn().mockResolvedValue({
                status: 'submitted',
                newRevisionId: 43,
            }),
            getRevisionSource: vi.fn().mockResolvedValue({
                revisionId: 43,
                source: 'Different source',
            }),
        };
        const result = await executeVerifiedPublish(publisher, {
            ...input,
            baseRevisionId: 41,
            baseTimestamp: '2026-07-18T00:00:00.000Z',
        });
        expect(publisher.submitEdit).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'update',
                createOnly: false,
                baseRevisionId: 41,
            }),
        );
        expect(result).toMatchObject({
            status: 'failed',
            error: { category: 'verification-failed' },
        });
    });

    it('keeps the production-disabled publisher non-writing', async () => {
        await expect(
            executeVerifiedPublish(new DisabledWikiPublisher(), input),
        ).resolves.toMatchObject({
            status: 'failed',
            error: { category: 'permission-denied', canRetry: false },
        });
    });

    it('normalizes abuse filters, CAPTCHA, conflicts, protection, and rate limits', () => {
        expect(normalizeProviderError({ code: 'editconflict' }).category).toBe(
            'edit-conflict',
        );
        expect(
            normalizeProviderError({
                code: 'abusefilter-disallowed',
                filterDescription: 'Disallowed pattern',
            }),
        ).toMatchObject({
            category: 'abuse-filter',
            filterDescription: 'Disallowed pattern',
        });
        expect(normalizeProviderError({ code: 'captcha' }).category).toBe(
            'captcha',
        );
        expect(normalizeProviderError({ code: 'protectedpage' }).category).toBe(
            'protected-page',
        );
        expect(normalizeProviderError({ code: 'maxlag' })).toMatchObject({
            category: 'rate-limited',
            canRetry: true,
        });
    });
});
