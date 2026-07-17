import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import type { ParsedPreview } from '@wikione/mediawiki';

export interface PreviewDocumentInput {
    readonly wikiBaseUrl: string;
    readonly siteName: string;
    readonly languageCode: string;
    readonly direction: 'ltr' | 'rtl';
    readonly parsed: ParsedPreview;
    readonly skin?: 'vector-2022' | 'vector';
}

export interface RenderedFeatureSummary {
    readonly images: number;
    readonly figures: number;
    readonly tables: number;
    readonly mathElements: number;
    readonly referenceLists: number;
    readonly audioElements: number;
    readonly videoElements: number;
    readonly interactiveElements: number;
}

const baseStyleModules = [
    'mediawiki.legacy.commonPrint',
    'mediawiki.skinning.content',
    'mediawiki.skinning.interface',
    'site.styles',
    'skins.vector.styles',
] as const;

/**
 * Constructs the document shown only on the dedicated preview origin. Parser
 * HTML is intentionally preserved for fidelity and must never be inserted into
 * the editor origin.
 */
export function createPreviewDocument(input: PreviewDocumentInput): string {
    const baseUrl = normalizeBaseUrl(input.wikiBaseUrl);
    const skin = input.skin ?? 'vector-2022';
    const metadata = readHeadMetadata(input.parsed.headHtml);
    const languageCode = metadata.languageCode ?? input.languageCode;
    const direction = metadata.direction ?? input.direction;
    const bodyClasses = [
        'mediawiki',
        `sitedir-${direction}`,
        direction,
        'skin-vector',
        `skin-${skin}`,
        'action-view',
        ...metadata.bodyClasses,
    ];
    const styleModules = uniqueSorted([
        ...baseStyleModules,
        ...input.parsed.moduleStyles,
    ]);
    const styleLinks = chunkModules(styleModules)
        .map(
            (modules) =>
                `<link rel="stylesheet" href="${escapeAttribute(resourceLoaderUrl(baseUrl, modules, 'styles', skin))}">`,
        )
        .join('\n        ');
    const startupUrl = resourceLoaderUrl(baseUrl, ['startup'], 'scripts', skin);
    const pageModules = uniqueSorted(input.parsed.modules);
    const javascriptConfig = safeJson(input.parsed.javascriptConfig);
    const moduleJson = safeJson(pageModules);
    const categoryHtml = input.parsed.categoriesHtml
        ? `<div id="catlinks" class="catlinks">${input.parsed.categoriesHtml}</div>`
        : '';
    const subtitleHtml = input.parsed.subtitle
        ? `<div id="contentSub">${input.parsed.subtitle}</div>`
        : '<div id="contentSub"></div>';
    const indicators = input.parsed.indicators.join('');

    return `<!doctype html>
<html lang="${escapeAttribute(languageCode)}" dir="${direction}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="referrer" content="no-referrer">
        <base href="${escapeAttribute(`${baseUrl.origin}/wiki/`)}">
        <title>${escapeHtml(input.parsed.title)} — ${escapeHtml(input.siteName)} preview</title>
        ${styleLinks}
    </head>
    <body class="${escapeAttribute(uniqueSorted(bodyClasses).join(' '))}" data-wikione-preview="true">
        <div id="content" class="mw-body" role="main">
            <div id="mw-indicator-mw-helplink" class="mw-indicators">${indicators}</div>
            <header class="mw-body-header vector-page-titlebar">
                <h1 id="firstHeading" class="firstHeading mw-first-heading">${input.parsed.displayTitle}</h1>
            </header>
            <div id="bodyContent" class="vector-body">
                <div id="siteSub" class="noprint">From ${escapeHtml(input.siteName)}</div>
                ${subtitleHtml}
                <div id="mw-content-text" class="mw-body-content">${input.parsed.text}</div>
                ${categoryHtml}
            </div>
        </div>
        <script src="${escapeAttribute(startupUrl)}"></script>
        <script>
            (() => {
                'use strict';
                if (window.mw) {
                    window.mw.config.set(${javascriptConfig});
                    window.mw.loader.load(${moduleJson});
                }
                for (const link of document.querySelectorAll('a[href]')) {
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                }
            })();
        </script>
    </body>
</html>`;
}

export function buildPreviewContentSecurityPolicy(wikiBaseUrl: string): string {
    const wikiOrigin = normalizeBaseUrl(wikiBaseUrl).origin;
    return [
        "default-src 'none'",
        `script-src 'unsafe-inline' 'unsafe-eval' ${wikiOrigin}`,
        `style-src 'unsafe-inline' ${wikiOrigin} https://*.wikimedia.org`,
        'img-src data: https:',
        'media-src blob: https:',
        'font-src data: https:',
        `connect-src ${wikiOrigin} https://*.wikimedia.org`,
        "object-src 'none'",
        `base-uri ${wikiOrigin}`,
        "form-action 'none'",
    ].join('; ');
}

export function inspectRenderedFeatures(html: string): RenderedFeatureSummary {
    const document = parse(html);
    return {
        images: countElements(document, (element) => element.tagName === 'img'),
        figures: countElements(
            document,
            (element) => element.tagName === 'figure',
        ),
        tables: countElements(
            document,
            (element) => element.tagName === 'table',
        ),
        mathElements: countElements(
            document,
            (element) =>
                element.tagName === 'math' ||
                hasClass(element, 'mwe-math-element'),
        ),
        referenceLists: countElements(
            document,
            (element) =>
                hasClass(element, 'references') ||
                hasClass(element, 'mw-references-wrap'),
        ),
        audioElements: countElements(
            document,
            (element) => element.tagName === 'audio',
        ),
        videoElements: countElements(
            document,
            (element) => element.tagName === 'video',
        ),
        interactiveElements: countElements(
            document,
            (element) =>
                hasClass(element, 'mw-kartographer-map') ||
                hasClass(element, 'mw-kartographer-maplink') ||
                hasClass(element, 'mw-graph'),
        ),
    };
}

interface HeadMetadata {
    readonly languageCode?: string;
    readonly direction?: 'ltr' | 'rtl';
    readonly bodyClasses: readonly string[];
}

function readHeadMetadata(headHtml: string): HeadMetadata {
    if (!headHtml.trim()) {
        return { bodyClasses: [] };
    }
    const document = parse(headHtml);
    const html = findElement(document, 'html');
    const body = findElement(document, 'body');
    const languageCode = html ? getAttribute(html, 'lang') : undefined;
    const directionValue = html ? getAttribute(html, 'dir') : undefined;
    const direction =
        directionValue === 'ltr' || directionValue === 'rtl'
            ? directionValue
            : undefined;
    const bodyClasses = body
        ? (getAttribute(body, 'class') ?? '')
              .split(/\s+/u)
              .filter((value) => /^[a-zA-Z0-9_-]+$/u.test(value))
        : [];
    return {
        ...(languageCode ? { languageCode } : {}),
        ...(direction ? { direction } : {}),
        bodyClasses,
    };
}

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

function findElement(node: Node, tagName: string): Element | undefined {
    if ('tagName' in node && node.tagName === tagName) {
        return node;
    }
    if ('childNodes' in node) {
        for (const child of node.childNodes) {
            const found = findElement(child, tagName);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

function countElements(
    node: Node,
    predicate: (element: Element) => boolean,
): number {
    let count = 0;
    if ('tagName' in node && predicate(node)) {
        count += 1;
    }
    if ('childNodes' in node) {
        for (const child of node.childNodes) {
            count += countElements(child, predicate);
        }
    }
    return count;
}

function getAttribute(element: Element, name: string): string | undefined {
    return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function hasClass(element: Element, className: string): boolean {
    return (getAttribute(element, 'class') ?? '')
        .split(/\s+/u)
        .includes(className);
}

function normalizeBaseUrl(value: string): URL {
    const url = new URL(value);
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new TypeError(
            'Preview wiki base URLs must be clean HTTPS origins.',
        );
    }
    return url;
}

function resourceLoaderUrl(
    baseUrl: URL,
    modules: readonly string[],
    only: 'scripts' | 'styles',
    skin: string,
): string {
    const url = new URL('/w/load.php', baseUrl);
    url.searchParams.set('lang', 'en');
    url.searchParams.set('modules', modules.join('|'));
    url.searchParams.set('only', only);
    url.searchParams.set('skin', skin);
    return url.toString();
}

function chunkModules(
    modules: readonly string[],
    maximumCharacters = 1_400,
): string[][] {
    const chunks: string[][] = [];
    let current: string[] = [];
    let length = 0;
    for (const module of modules) {
        if (
            current.length > 0 &&
            length + module.length + 1 > maximumCharacters
        ) {
            chunks.push(current);
            current = [];
            length = 0;
        }
        current.push(module);
        length += module.length + 1;
    }
    if (current.length > 0) {
        chunks.push(current);
    }
    return chunks;
}

function uniqueSorted(values: readonly string[]): string[] {
    return [...new Set(values)].sort((left, right) =>
        left.localeCompare(right),
    );
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
    return escapeHtml(value);
}

function safeJson(value: unknown): string {
    return JSON.stringify(value)
        .replaceAll('<', '\\u003c')
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029');
}
