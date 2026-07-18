export type WikitextTokenKind =
    | 'comment'
    | 'external-link-bracket'
    | 'formatting'
    | 'heading-marker'
    | 'internal-link-bracket'
    | 'list-marker'
    | 'magic-word'
    | 'opaque-tag'
    | 'parameter-brace'
    | 'table-marker'
    | 'tag'
    | 'template-brace'
    | 'text'
    | 'url';

export interface WikitextToken {
    readonly kind: WikitextTokenKind;
    readonly from: number;
    readonly to: number;
}

const opaqueTagNames = [
    'math',
    'nowiki',
    'pre',
    'source',
    'syntaxhighlight',
] as const;

/**
 * Lossless, error-tolerant lexer used by tests and non-CodeMirror consumers.
 * It intentionally recognizes editing structure rather than attempting to
 * reproduce the target wiki's context-sensitive parser.
 */
export function tokenizeWikitext(source: string): WikitextToken[] {
    const tokens: WikitextToken[] = [];
    let position = 0;
    let lineStart = true;

    while (position < source.length) {
        const token = readSpecialToken(source, position, lineStart);
        if (token) {
            tokens.push(token);
            lineStart = source.slice(token.from, token.to).endsWith('\n');
            position = token.to;
            continue;
        }

        const from = position;
        do {
            lineStart = source[position] === '\n';
            position += 1;
        } while (
            position < source.length &&
            !readSpecialToken(source, position, lineStart)
        );
        tokens.push({ kind: 'text', from, to: position });
    }

    return tokens;
}

function readSpecialToken(
    source: string,
    position: number,
    lineStart: boolean,
): WikitextToken | undefined {
    const remaining = source.slice(position);
    if (remaining.startsWith('<!--')) {
        const closing = source.indexOf('-->', position + 4);
        return token(
            'comment',
            position,
            closing === -1 ? source.length : closing + 3,
        );
    }

    const opaque = matchOpaqueTag(source, position);
    if (opaque) {
        return token('opaque-tag', position, opaque.to);
    }

    if (lineStart) {
        const heading = /^={1,6}(?!=)/u.exec(remaining);
        if (heading) {
            return token(
                'heading-marker',
                position,
                position + heading[0].length,
            );
        }
        const table = /^(?:\{\||\|\}|\|-|[!|](?=[!|+\-\s]))/u.exec(remaining);
        if (table) {
            return token('table-marker', position, position + table[0].length);
        }
        const list = /^[*#:;]+/u.exec(remaining);
        if (list) {
            return token('list-marker', position, position + list[0].length);
        }
    }

    const fixedTokens: readonly [string, WikitextTokenKind][] = [
        ['{{{', 'parameter-brace'],
        ['}}}', 'parameter-brace'],
        ['{{', 'template-brace'],
        ['}}', 'template-brace'],
        ['[[', 'internal-link-bracket'],
        [']]', 'internal-link-bracket'],
    ];
    for (const [value, kind] of fixedTokens) {
        if (remaining.startsWith(value)) {
            return token(kind, position, position + value.length);
        }
    }

    const formatting = /^'{2,5}/u.exec(remaining);
    if (formatting) {
        return token('formatting', position, position + formatting[0].length);
    }
    const magicWord = /^__[A-Z][A-Z0-9_]*__/u.exec(remaining);
    if (magicWord) {
        return token('magic-word', position, position + magicWord[0].length);
    }
    const url = /^https?:\/\/[^\s\]}<>]+/u.exec(remaining);
    if (url) {
        return token('url', position, position + url[0].length);
    }
    const tag = /^<\/?[A-Za-z][^>]*>/u.exec(remaining);
    if (tag) {
        return token('tag', position, position + tag[0].length);
    }
    if (source[position] === '[' || source[position] === ']') {
        return token('external-link-bracket', position, position + 1);
    }
    return undefined;
}

function matchOpaqueTag(
    source: string,
    position: number,
): { readonly to: number } | undefined {
    const remaining = source.slice(position);
    const opening = new RegExp(
        `^<(${opaqueTagNames.join('|')})(?:\\s[^>]*)?>`,
        'iu',
    ).exec(remaining);
    if (!opening) {
        return undefined;
    }
    if (opening[0].endsWith('/>')) {
        return { to: position + opening[0].length };
    }
    const tagName = opening[1] ?? '';
    const afterOpening = position + opening[0].length;
    const closingPattern = new RegExp(`</${escapeRegex(tagName)}\\s*>`, 'iu');
    const closing = closingPattern.exec(source.slice(afterOpening));
    return {
        to: closing
            ? afterOpening + closing.index + closing[0].length
            : source.length,
    };
}

function token(
    kind: WikitextTokenKind,
    from: number,
    to: number,
): WikitextToken {
    return { kind, from, to };
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
