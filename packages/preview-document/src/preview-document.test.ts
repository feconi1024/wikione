import { describe, expect, it } from 'vitest';

import type { ParsedPreview } from '@wikione/mediawiki';

import {
    buildPreviewContentSecurityPolicy,
    createPreviewDocument,
    inspectRenderedFeatures,
} from './preview-document.js';

const parsed: ParsedPreview = {
    title: 'Sandbox',
    text: `<div class="mw-parser-output">
        <figure><img src="https://upload.wikimedia.org/example.jpg" alt="Example"></figure>
        <table><tbody><tr><td>Cell</td></tr></tbody></table>
        <span class="mwe-math-element"><math><mi>x</mi></math></span>
        <ol class="references"><li>Reference</li></ol>
        <video controls></video>
    </div>`,
    headHtml:
        '<!doctype html><html lang="ar" dir="rtl"><head></head><body class="ns-0 page-Sandbox">',
    displayTitle: 'Sandbox',
    subtitle: '',
    indicators: [],
    categoriesHtml: '',
    modules: ['ext.cite.ux-enhancements', 'user', 'user.options'],
    moduleStyles: ['ext.cite.styles', 'user.styles'],
    javascriptConfig: { wgPageName: '</script><script>bad()</script>' },
    warnings: [],
};

describe('preview document', () => {
    it('uses head metadata and bootstraps parser-declared modules', () => {
        const html = createPreviewDocument({
            wikiBaseUrl: 'https://ar.wikipedia.org',
            siteName: 'Wikipedia',
            languageCode: 'en',
            direction: 'ltr',
            parsed,
        });

        expect(html).toContain('<html lang="ar" dir="rtl">');
        expect(html).toContain('ext.cite.styles');
        expect(html).toContain('ext.cite.ux-enhancements');
        expect(html).not.toContain('user.options');
        expect(html).not.toContain('user.styles');
        expect(html).toContain('lang=ar');
        expect(html).toContain('\\u003c/script>');
        expect(html).not.toContain('</script><script>bad()');
    });

    it('detects representative rendered media', () => {
        const html = createPreviewDocument({
            wikiBaseUrl: 'https://en.wikipedia.org',
            siteName: 'Wikipedia',
            languageCode: 'en',
            direction: 'ltr',
            parsed,
        });

        expect(inspectRenderedFeatures(html)).toMatchObject({
            images: 1,
            figures: 1,
            tables: 1,
            mathElements: 2,
            referenceLists: 1,
            videoElements: 1,
        });
    });

    it('builds a restrictive preview-only CSP', () => {
        const policy = buildPreviewContentSecurityPolicy(
            'https://en.wikipedia.org',
        );

        expect(policy).toContain("default-src 'none'");
        expect(policy).toContain("object-src 'none'");
        expect(policy).toContain("form-action 'none'");
        expect(policy).not.toContain('editor.example');
    });
});
