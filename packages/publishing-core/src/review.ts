import { diffLines } from 'diff';

const maximumSourceLength = 500_000;

export type ReviewLineKind = 'context' | 'addition' | 'deletion';

export interface ReviewLine {
    readonly kind: ReviewLineKind;
    readonly text: string;
    readonly oldLine?: number;
    readonly newLine?: number;
}

export interface ReviewModel {
    readonly lines: readonly ReviewLine[];
    readonly additions: number;
    readonly deletions: number;
    readonly changed: boolean;
    readonly truncated: boolean;
}

/** Produces a bounded, text-only line review suitable for safe UI rendering. */
export function createReviewModel(
    baseSource: string,
    source: string,
): ReviewModel {
    assertSource(baseSource);
    assertSource(source);
    const changes = diffLines(
        normalizeNewlines(baseSource),
        normalizeNewlines(source),
        {
            ignoreNewlineAtEof: false,
            maxEditLength: 20_000,
            timeout: 2_000,
        },
    );
    if (!changes) {
        return fallbackReview(baseSource, source);
    }
    const lines: ReviewLine[] = [];
    let oldLine = 1;
    let newLine = 1;
    let additions = 0;
    let deletions = 0;
    for (const change of changes) {
        for (const text of splitChangedLines(change.value)) {
            if (change.added) {
                lines.push({ kind: 'addition', text, newLine });
                additions += 1;
                newLine += 1;
            } else if (change.removed) {
                lines.push({ kind: 'deletion', text, oldLine });
                deletions += 1;
                oldLine += 1;
            } else {
                lines.push({ kind: 'context', text, oldLine, newLine });
                oldLine += 1;
                newLine += 1;
            }
        }
    }
    return {
        lines,
        additions,
        deletions,
        changed: additions > 0 || deletions > 0,
        truncated: false,
    };
}

function fallbackReview(baseSource: string, source: string): ReviewModel {
    const removed = splitChangedLines(normalizeNewlines(baseSource)).map(
        (text, index): ReviewLine => ({
            kind: 'deletion',
            text,
            oldLine: index + 1,
        }),
    );
    const added = splitChangedLines(normalizeNewlines(source)).map(
        (text, index): ReviewLine => ({
            kind: 'addition',
            text,
            newLine: index + 1,
        }),
    );
    return {
        lines: [...removed, ...added],
        additions: added.length,
        deletions: removed.length,
        changed: baseSource !== source,
        truncated: true,
    };
}

function splitChangedLines(value: string): readonly string[] {
    if (!value) {
        return [];
    }
    const lines = value.split('\n');
    if (lines.at(-1) === '') {
        lines.pop();
    }
    return lines;
}

function normalizeNewlines(value: string): string {
    return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function assertSource(source: string): void {
    if (source.length > maximumSourceLength) {
        throw new RangeError('Review source exceeds 500,000 characters.');
    }
}
