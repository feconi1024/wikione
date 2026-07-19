import {
    autocompletion,
    type CompletionContext,
    type CompletionResult,
    snippetCompletion,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
    bracketMatching,
    foldGutter,
    HighlightStyle,
    indentOnInput,
    StreamLanguage,
    syntaxHighlighting,
    type StreamParser,
} from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { type Extension } from '@codemirror/state';
import {
    crosshairCursor,
    drawSelection,
    dropCursor,
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    rectangularSelection,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

import { analyzeWikitext } from './analysis.js';

interface WikitextStreamState {
    comment: boolean;
    opaqueTag: string | undefined;
    heading: boolean;
    templateDepth: number;
    parameterDepth: number;
    linkDepth: number;
}

const parser: StreamParser<WikitextStreamState> = {
    tokenTable: {
        heading: tags.heading,
        'heading-mark': tags.processingInstruction,
        'link-content': tags.link,
        'magic-word': tags.bool,
        'opaque-content': tags.string,
        parameter: tags.variableName,
        separator: tags.separator,
        tag: tags.tagName,
        'template-content': tags.typeName,
        url: tags.url,
    },
    startState: () => ({
        comment: false,
        opaqueTag: undefined,
        heading: false,
        templateDepth: 0,
        parameterDepth: 0,
        linkDepth: 0,
    }),
    token(stream, state) {
        if (stream.sol()) {
            state.heading = false;
        }
        if (state.comment) {
            if (stream.skipTo('-->')) {
                stream.match('-->');
                state.comment = false;
            } else {
                stream.skipToEnd();
            }
            return 'comment';
        }
        if (state.opaqueTag) {
            const closing = `</${state.opaqueTag}`;
            if (
                stream.match(new RegExp(`${escapeRegex(closing)}\\s*>`, 'iu'))
            ) {
                state.opaqueTag = undefined;
                return 'tag';
            }
            if (stream.skipTo(closing)) {
                return 'opaque-content';
            }
            stream.skipToEnd();
            return 'opaque-content';
        }
        if (stream.match('<!--')) {
            state.comment = true;
            return 'comment';
        }

        const opaqueOpening = stream.match(
            /<(math|nowiki|pre|source|syntaxhighlight)(?:\s[^>]*)?>/iu,
        );
        if (opaqueOpening) {
            const match = opaqueOpening as RegExpMatchArray;
            if (!match[0].endsWith('/>')) {
                state.opaqueTag = (match[1] ?? '').toLowerCase();
            }
            return 'tag';
        }
        if (stream.sol() && stream.match(/={1,6}(?!=)/u)) {
            state.heading = true;
            return 'heading-mark';
        }
        if (state.heading) {
            if (stream.match(/={1,6}\s*$/u)) {
                state.heading = false;
                return 'heading-mark';
            }
            stream.next();
            stream.eatWhile(/[^=]/u);
            return 'heading';
        }
        if (stream.sol() && stream.match(/(?:\{\||\|\}|\|-)/u)) {
            return 'keyword';
        }
        if (stream.sol() && stream.match(/[*#:;]+/u)) {
            return 'list';
        }
        if (stream.match('{{{')) {
            state.parameterDepth += 1;
            return 'bracket';
        }
        if (stream.match('}}}')) {
            state.parameterDepth = Math.max(0, state.parameterDepth - 1);
            return 'bracket';
        }
        if (stream.match('{{')) {
            state.templateDepth += 1;
            return 'bracket';
        }
        if (stream.match('}}')) {
            state.templateDepth = Math.max(0, state.templateDepth - 1);
            return 'bracket';
        }
        if (stream.match('[[')) {
            state.linkDepth += 1;
            return 'bracket';
        }
        if (stream.match(']]')) {
            state.linkDepth = Math.max(0, state.linkDepth - 1);
            return 'bracket';
        }
        if (stream.match(/^'{2,5}/u)) {
            return 'strong';
        }
        if (stream.match(/^__[A-Z][A-Z0-9_]*__/u)) {
            return 'magic-word';
        }
        if (stream.match(/^https?:\/\/[^\s\]}<>]+/u)) {
            return 'url';
        }
        if (stream.match(/^<\/?[A-Za-z][^>]*>/u)) {
            return 'tag';
        }
        if (stream.match('|')) {
            return 'separator';
        }

        stream.next();
        stream.eatWhile((character) => !"{}[]|<'_=".includes(character));
        if (state.parameterDepth > 0) {
            return 'parameter';
        }
        if (state.templateDepth > 0) {
            return 'template-content';
        }
        if (state.linkDepth > 0) {
            return 'link-content';
        }
        return null;
    },
};

const accessibleHighlightStyle = HighlightStyle.define([
    { tag: tags.comment, color: '#59656b', fontStyle: 'italic' },
    { tag: tags.heading, color: '#633f00', fontWeight: '700' },
    { tag: tags.processingInstruction, color: '#754600' },
    {
        tag: [tags.link, tags.url],
        color: '#005c91',
        textDecoration: 'underline',
    },
    { tag: tags.bool, color: '#763b73' },
    { tag: tags.string, color: '#006c45' },
    { tag: tags.variableName, color: '#704000' },
    { tag: tags.separator, color: '#566169' },
    { tag: tags.tagName, color: '#007149' },
    { tag: tags.typeName, color: '#5e3b91' },
]);

export const wikitextLanguage = StreamLanguage.define(parser);

export interface WikitextExtensionOptions {
    readonly onChange?: (source: string) => void;
    readonly onSelectionChange?: (anchor: number, head: number) => void;
}

export function createWikitextExtensions(
    options: WikitextExtensionOptions = {},
): Extension[] {
    return [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        wikitextLanguage,
        syntaxHighlighting(accessibleHighlightStyle),
        autocompletion({ override: [wikitextCompletionSource] }),
        linter(
            (view): Diagnostic[] =>
                analyzeWikitext(view.state.doc.toString()).diagnostics.map(
                    (diagnostic) => ({
                        from: diagnostic.from,
                        to: Math.max(diagnostic.from, diagnostic.to),
                        severity: diagnostic.severity,
                        message: diagnostic.message,
                    }),
                ),
            { delay: 500 },
        ),
        lintGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                options.onChange?.(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged) {
                const selection = update.state.selection.main;
                options.onSelectionChange?.(selection.anchor, selection.head);
            }
        }),
        editorTheme,
    ];
}

const completionOptions = [
    snippetCompletion('{{${Template name}|${parameter}=${value}}}', {
        label: 'Template',
        detail: '{{Template|parameter=value}}',
        type: 'function',
    }),
    snippetCompletion('[[${Page title}|${label}]]', {
        label: 'Internal link',
        detail: 'Link to another wiki page',
        type: 'keyword',
    }),
    snippetCompletion('<ref>${citation}</ref>', {
        label: 'Reference',
        detail: 'Inline citation',
        type: 'keyword',
    }),
    snippetCompletion('== ${Section heading} ==', {
        label: 'Section heading',
        detail: 'Level-two heading',
        type: 'keyword',
    }),
    snippetCompletion(
        '{| class="wikitable"\n! ${Header 1}\n! ${Header 2}\n|-\n| ${Cell 1}\n| ${Cell 2}\n|}',
        {
            label: 'Wiki table',
            detail: 'Two-column wikitable',
            type: 'keyword',
        },
    ),
] as const;

function wikitextCompletionSource(
    context: CompletionContext,
): CompletionResult | null {
    const before = context.matchBefore(/[A-Za-z{[<][A-Za-z0-9 _:{[<|-]*$/u);
    if (!before && !context.explicit) {
        return null;
    }
    return {
        from: before?.from ?? context.pos,
        options: [...completionOptions],
        validFor: /^[A-Za-z0-9 _:{[<|-]*$/u,
    };
}

const editorTheme = EditorView.theme({
    '&': {
        height: '100%',
        color: 'var(--ink-strong, #1b2430)',
        backgroundColor: 'var(--editor-paper, #fffdf8)',
        fontSize: '14px',
    },
    '.cm-scroller': {
        fontFamily:
            '"IBM Plex Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
        lineHeight: '1.65',
    },
    '.cm-content': {
        caretColor: 'var(--accent, #0c6b58)',
        padding: '16px 0 40px',
    },
    '.cm-gutters': {
        backgroundColor: 'var(--editor-gutter, #f3f0e8)',
        borderRight: '1px solid var(--border, #d8d4ca)',
        color: 'var(--ink-muted, #68717d)',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
        backgroundColor:
            'color-mix(in srgb, var(--accent, #0c6b58) 8%, transparent)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor:
            'color-mix(in srgb, var(--accent, #0c6b58) 22%, transparent)',
    },
    '&.cm-focused': { outline: 'none' },
});

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
