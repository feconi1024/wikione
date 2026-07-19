import { diff3Merge } from 'node-diff3';

const maximumSourceLength = 500_000;

export type MergeSegment =
    | { readonly kind: 'clean'; readonly lines: readonly string[] }
    | {
          readonly kind: 'conflict';
          readonly id: number;
          readonly base: readonly string[];
          readonly ours: readonly string[];
          readonly theirs: readonly string[];
      };

export interface MergeModel {
    readonly segments: readonly MergeSegment[];
    readonly conflictCount: number;
    readonly mergedSource?: string;
    readonly trailingNewline: boolean;
}

export type ConflictResolution =
    | { readonly choice: 'ours' }
    | { readonly choice: 'theirs' }
    | { readonly choice: 'manual'; readonly source: string };

/** Performs a line-oriented three-way merge without silently resolving overlap. */
export function mergeDocuments(
    baseSource: string,
    ourSource: string,
    theirSource: string,
): MergeModel {
    for (const source of [baseSource, ourSource, theirSource]) {
        assertSource(source);
    }
    const base = tokenize(baseSource);
    const ours = tokenize(ourSource);
    const theirs = tokenize(theirSource);
    const blocks = diff3Merge(ours, base, theirs, {
        excludeFalseConflicts: true,
    });
    let conflictId = 0;
    const segments: MergeSegment[] = blocks.map((block) => {
        if (block.ok) {
            return { kind: 'clean', lines: block.ok };
        }
        if (!block.conflict) {
            throw new TypeError('Three-way merge returned an invalid block.');
        }
        const id = conflictId;
        conflictId += 1;
        return {
            kind: 'conflict',
            id,
            base: block.conflict.o,
            ours: block.conflict.a,
            theirs: block.conflict.b,
        };
    });
    const trailingNewline =
        ourSource.endsWith('\n') || theirSource.endsWith('\n');
    return {
        segments,
        conflictCount: conflictId,
        ...(conflictId === 0
            ? {
                  mergedSource: joinLines(
                      flattenClean(segments),
                      trailingNewline,
                  ),
              }
            : {}),
        trailingNewline,
    };
}

/** Applies an explicit choice for every conflict and returns resolved source. */
export function resolveMerge(
    model: MergeModel,
    resolutions: Readonly<Record<number, ConflictResolution>>,
): string {
    const lines: string[] = [];
    for (const segment of model.segments) {
        if (segment.kind === 'clean') {
            lines.push(...segment.lines);
            continue;
        }
        const resolution = resolutions[segment.id];
        if (!resolution) {
            throw new RangeError(
                `Conflict ${String(segment.id)} is unresolved.`,
            );
        }
        if (resolution.choice === 'ours') {
            lines.push(...segment.ours);
        } else if (resolution.choice === 'theirs') {
            lines.push(...segment.theirs);
        } else {
            lines.push(...tokenize(resolution.source));
        }
    }
    return joinLines(lines, model.trailingNewline);
}

function tokenize(source: string): string[] {
    const normalized = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    if (!normalized) {
        return [];
    }
    const lines = normalized.split('\n');
    if (lines.at(-1) === '') {
        lines.pop();
    }
    return lines;
}

function joinLines(lines: readonly string[], trailingNewline: boolean): string {
    return `${lines.join('\n')}${trailingNewline && lines.length > 0 ? '\n' : ''}`;
}

function flattenClean(segments: readonly MergeSegment[]): readonly string[] {
    return segments.flatMap((segment) =>
        segment.kind === 'clean' ? [...segment.lines] : [],
    );
}

function assertSource(source: string): void {
    if (source.length > maximumSourceLength) {
        throw new RangeError('Merge source exceeds 500,000 characters.');
    }
}
