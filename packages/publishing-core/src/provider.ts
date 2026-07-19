import type { NormalizedPublishError, WatchlistBehavior } from './types.js';

export interface ProviderEditIntent {
    readonly operation: 'create' | 'update';
    readonly title: string;
    readonly source: string;
    readonly summary: string;
    readonly minor: boolean;
    readonly watchlist: WatchlistBehavior;
    readonly editingStartedAt: string;
    readonly baseRevisionId?: number;
    readonly baseTimestamp?: string;
    readonly createOnly: boolean;
}

export type ProviderEditResult =
    | { readonly status: 'submitted'; readonly newRevisionId: number }
    | { readonly status: 'failed'; readonly error: NormalizedPublishError };

export interface WikiPublisher {
    readonly submitEdit: (
        intent: ProviderEditIntent,
    ) => Promise<ProviderEditResult>;
    readonly getRevisionSource: (
        revisionId: number,
    ) => Promise<{ readonly revisionId: number; readonly source: string }>;
}

export type VerifiedPublishResult =
    | { readonly status: 'verified'; readonly newRevisionId: number }
    | { readonly status: 'failed'; readonly error: NormalizedPublishError };

export interface VerifiedPublishInput {
    readonly title: string;
    readonly source: string;
    readonly summary: string;
    readonly minor: boolean;
    readonly watchlist: WatchlistBehavior;
    readonly editingStartedAt: string;
    readonly baseRevisionId?: number;
    readonly baseTimestamp?: string;
}

/** Builds create/update safeguards and verifies the exact stored revision. */
export async function executeVerifiedPublish(
    publisher: WikiPublisher,
    input: VerifiedPublishInput,
): Promise<VerifiedPublishResult> {
    const operation = input.baseRevisionId ? 'update' : 'create';
    const result = await publisher.submitEdit({
        operation,
        title: input.title,
        source: input.source,
        summary: input.summary,
        minor: input.minor,
        watchlist: input.watchlist,
        editingStartedAt: input.editingStartedAt,
        ...(input.baseRevisionId
            ? { baseRevisionId: input.baseRevisionId }
            : {}),
        ...(input.baseTimestamp ? { baseTimestamp: input.baseTimestamp } : {}),
        createOnly: operation === 'create',
    });
    if (result.status === 'failed') {
        return result;
    }
    try {
        const revision = await publisher.getRevisionSource(
            result.newRevisionId,
        );
        if (
            revision.revisionId !== result.newRevisionId ||
            revision.source !== input.source
        ) {
            return verificationFailure();
        }
        return { status: 'verified', newRevisionId: result.newRevisionId };
    } catch {
        return verificationFailure();
    }
}

export class DisabledWikiPublisher implements WikiPublisher {
    public submitEdit(): Promise<ProviderEditResult> {
        return Promise.resolve({
            status: 'failed',
            error: {
                category: 'permission-denied',
                message:
                    'Publishing is unavailable until Wikimedia OAuth approval.',
                canRetry: false,
            },
        });
    }

    public getRevisionSource(): Promise<never> {
        return Promise.reject(
            new Error('The disabled publisher never verifies a revision.'),
        );
    }
}

export function normalizeProviderError(input: {
    readonly code: string;
    readonly message?: string;
    readonly filterDescription?: string;
}): NormalizedPublishError {
    const code = input.code.toLocaleLowerCase('en-US');
    if (code === 'editconflict') {
        return normalized(
            'edit-conflict',
            'The page changed while you edited it.',
            true,
        );
    }
    if (code.startsWith('abusefilter')) {
        return {
            ...normalized(
                'abuse-filter',
                'The target wiki abuse filter rejected this edit.',
                false,
            ),
            ...(input.filterDescription
                ? { filterDescription: input.filterDescription.slice(0, 500) }
                : {}),
        };
    }
    if (code.includes('captcha')) {
        return normalized(
            'captcha',
            'The target wiki requires a CAPTCHA that must be completed there.',
            false,
        );
    }
    if (
        ['protectedpage', 'cascadeprotected', 'titleprotected'].includes(code)
    ) {
        return normalized('protected-page', 'This page is protected.', false);
    }
    if (['permissiondenied', 'noedit', 'blocked'].includes(code)) {
        return normalized(
            'permission-denied',
            'The connected wiki account may not make this edit.',
            false,
        );
    }
    if (['ratelimited', 'maxlag'].includes(code)) {
        return normalized(
            'rate-limited',
            'The target wiki asked WikiOne to wait.',
            true,
        );
    }
    if (['badtoken', 'notoken'].includes(code)) {
        return normalized('bad-token', 'The wiki authorization expired.', true);
    }
    if (['readonly', 'readonlytext'].includes(code)) {
        return normalized(
            'read-only',
            'The target wiki is temporarily read-only.',
            true,
        );
    }
    return normalized(
        'unknown',
        input.message?.slice(0, 2_000) || 'The target wiki rejected this edit.',
        false,
    );
}

function verificationFailure(): VerifiedPublishResult {
    return {
        status: 'failed',
        error: {
            category: 'verification-failed',
            message:
                'The edit response could not be verified against the stored revision.',
            canRetry: false,
        },
    };
}

function normalized(
    category: NormalizedPublishError['category'],
    message: string,
    canRetry: boolean,
): NormalizedPublishError {
    return { category, message, canRetry };
}
