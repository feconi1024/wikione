export type WikitextCommand =
    | 'bold'
    | 'bullet-list'
    | 'heading'
    | 'internal-link'
    | 'italic'
    | 'number-list'
    | 'reference'
    | 'table'
    | 'template';

export interface TextSelection {
    readonly from: number;
    readonly to: number;
}

export interface CommandResult {
    readonly source: string;
    readonly selection: TextSelection;
}

export function applyWikitextCommand(
    source: string,
    selection: TextSelection,
    command: WikitextCommand,
): CommandResult {
    const from = clamp(selection.from, 0, source.length);
    const to = clamp(selection.to, from, source.length);
    const selected = source.slice(from, to);

    switch (command) {
        case 'bold':
            return wrap(source, from, to, "'''", "'''", 'bold text');
        case 'italic':
            return wrap(source, from, to, "''", "''", 'italic text');
        case 'internal-link':
            return wrap(source, from, to, '[[', ']]', 'Page title');
        case 'template':
            return wrap(source, from, to, '{{', '}}', 'Template name');
        case 'reference':
            return wrap(source, from, to, '<ref>', '</ref>', 'citation');
        case 'heading':
            return replace(
                source,
                from,
                to,
                `== ${selected || 'Section heading'} ==`,
                selected ? undefined : { from: 3, to: 18 },
            );
        case 'bullet-list':
            return prefixLines(source, from, to, '* ', 'List item');
        case 'number-list':
            return prefixLines(source, from, to, '# ', 'List item');
        case 'table':
            return replace(
                source,
                from,
                to,
                `{| class="wikitable"\n! Header 1\n! Header 2\n|-\n| Cell 1\n| Cell 2\n|}`,
                { from: 22, to: 30 },
            );
    }
}

function wrap(
    source: string,
    from: number,
    to: number,
    prefix: string,
    suffix: string,
    placeholder: string,
): CommandResult {
    const content = source.slice(from, to) || placeholder;
    return replace(source, from, to, `${prefix}${content}${suffix}`, {
        from: prefix.length,
        to: prefix.length + content.length,
    });
}

function prefixLines(
    source: string,
    from: number,
    to: number,
    prefix: string,
    placeholder: string,
): CommandResult {
    const content = source.slice(from, to) || placeholder;
    const replacement = content
        .split('\n')
        .map((line) => `${prefix}${line}`)
        .join('\n');
    return replace(source, from, to, replacement, {
        from: prefix.length,
        to: replacement.length,
    });
}

function replace(
    source: string,
    from: number,
    to: number,
    replacement: string,
    relativeSelection?: TextSelection,
): CommandResult {
    return {
        source: `${source.slice(0, from)}${replacement}${source.slice(to)}`,
        selection: relativeSelection
            ? {
                  from: from + relativeSelection.from,
                  to: from + relativeSelection.to,
              }
            : {
                  from: from + replacement.length,
                  to: from + replacement.length,
              },
    };
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}
