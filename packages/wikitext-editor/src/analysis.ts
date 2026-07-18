export interface WikitextDiagnostic {
    readonly from: number;
    readonly to: number;
    readonly severity: 'warning' | 'error';
    readonly code: string;
    readonly message: string;
}

export interface WikitextSection {
    readonly level: number;
    readonly title: string;
    readonly from: number;
    readonly to: number;
}

export interface WikitextAnalysis {
    readonly diagnostics: readonly WikitextDiagnostic[];
    readonly sections: readonly WikitextSection[];
}

type FrameType = 'link' | 'parameter' | 'template';

interface Frame {
    readonly type: FrameType;
    readonly from: number;
}

const delimiterDefinitions: readonly {
    readonly opening: string;
    readonly closing: string;
    readonly type: FrameType;
    readonly label: string;
}[] = [
    {
        opening: '{{{',
        closing: '}}}',
        type: 'parameter',
        label: 'template parameter',
    },
    {
        opening: '{{',
        closing: '}}',
        type: 'template',
        label: 'template',
    },
    {
        opening: '[[',
        closing: ']]',
        type: 'link',
        label: 'internal link',
    },
] as const;

export function analyzeWikitext(source: string): WikitextAnalysis {
    const diagnostics: WikitextDiagnostic[] = [];
    const sections = readSections(source);
    const stack: Frame[] = [];
    let position = 0;
    let tableStart: number | undefined;

    while (position < source.length) {
        if (source.startsWith('<!--', position)) {
            const closing = source.indexOf('-->', position + 4);
            if (closing === -1) {
                diagnostics.push({
                    from: position,
                    to: Math.min(source.length, position + 4),
                    severity: 'error',
                    code: 'unclosed-comment',
                    message: 'Close this comment with -->.',
                });
                break;
            }
            position = closing + 3;
            continue;
        }

        const opaque = readOpaqueRange(source, position);
        if (opaque) {
            if (!opaque.closed) {
                diagnostics.push({
                    from: position,
                    to: Math.min(
                        source.length,
                        position + opaque.openingLength,
                    ),
                    severity: 'error',
                    code: 'unclosed-opaque-tag',
                    message: `Close the <${opaque.tagName}> block.`,
                });
            }
            position = opaque.to;
            continue;
        }

        const lineStart = position === 0 || source[position - 1] === '\n';
        if (lineStart && source.startsWith('{|', position)) {
            if (tableStart !== undefined) {
                diagnostics.push({
                    from: position,
                    to: position + 2,
                    severity: 'warning',
                    code: 'nested-table-start',
                    message:
                        'A table was started before the previous table closed.',
                });
            }
            tableStart = position;
            position += 2;
            continue;
        }
        if (lineStart && source.startsWith('|}', position)) {
            if (tableStart === undefined) {
                diagnostics.push({
                    from: position,
                    to: position + 2,
                    severity: 'warning',
                    code: 'unexpected-table-end',
                    message: 'This table end has no matching {| marker.',
                });
            } else {
                tableStart = undefined;
            }
            position += 2;
            continue;
        }

        const closing = delimiterDefinitions.find((definition) =>
            source.startsWith(definition.closing, position),
        );
        if (closing) {
            if (stack.at(-1)?.type === closing.type) {
                stack.pop();
            } else {
                diagnostics.push({
                    from: position,
                    to: position + closing.closing.length,
                    severity: 'warning',
                    code: `unexpected-${closing.type}-end`,
                    message: `This ${closing.label} closing marker has no matching opener.`,
                });
            }
            position += closing.closing.length;
            continue;
        }

        const opening = delimiterDefinitions.find((definition) =>
            source.startsWith(definition.opening, position),
        );
        if (opening) {
            stack.push({ type: opening.type, from: position });
            position += opening.opening.length;
            continue;
        }

        position += 1;
    }

    for (const frame of stack) {
        const definition = delimiterDefinitions.find(
            (candidate) => candidate.type === frame.type,
        );
        diagnostics.push({
            from: frame.from,
            to: Math.min(
                source.length,
                frame.from + (definition?.opening.length ?? 1),
            ),
            severity: 'error',
            code: `unclosed-${frame.type}`,
            message: `Close this ${definition?.label ?? frame.type}.`,
        });
    }
    if (tableStart !== undefined) {
        diagnostics.push({
            from: tableStart,
            to: Math.min(source.length, tableStart + 2),
            severity: 'error',
            code: 'unclosed-table',
            message: 'Close this table with |} on its own line.',
        });
    }

    return {
        diagnostics: diagnostics.sort((left, right) => left.from - right.from),
        sections,
    };
}

function readSections(source: string): WikitextSection[] {
    const sections: WikitextSection[] = [];
    const pattern = /^(={1,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gmu;
    for (const match of source.matchAll(pattern)) {
        const marker = match[1] ?? '';
        const title = (match[2] ?? '').trim();
        if (!title || match.index === undefined) {
            continue;
        }
        sections.push({
            level: marker.length,
            title,
            from: match.index,
            to: match.index + match[0].length,
        });
    }
    return sections;
}

function readOpaqueRange(
    source: string,
    position: number,
):
    | {
          readonly tagName: string;
          readonly openingLength: number;
          readonly to: number;
          readonly closed: boolean;
      }
    | undefined {
    const opening =
        /^<(math|nowiki|pre|source|syntaxhighlight)(?:\s[^>]*)?>/iu.exec(
            source.slice(position),
        );
    if (!opening) {
        return undefined;
    }
    const tagName = opening[1] ?? '';
    if (opening[0].endsWith('/>')) {
        return {
            tagName,
            openingLength: opening[0].length,
            to: position + opening[0].length,
            closed: true,
        };
    }
    const afterOpening = position + opening[0].length;
    const closingPattern = new RegExp(`</${tagName}\\s*>`, 'iu');
    const closing = closingPattern.exec(source.slice(afterOpening));
    return {
        tagName,
        openingLength: opening[0].length,
        to: closing
            ? afterOpening + closing.index + closing[0].length
            : source.length,
        closed: Boolean(closing),
    };
}
