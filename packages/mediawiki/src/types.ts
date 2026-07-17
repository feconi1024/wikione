export interface RevisionSource {
    readonly pageId: number;
    readonly revisionId: number;
    readonly timestamp: string;
    readonly title: string;
    readonly contentModel: string;
    readonly source: string;
}

export interface ParseWarning {
    readonly code?: string;
    readonly message: string;
}

export interface ParsedPreview {
    readonly title: string;
    readonly pageId?: number;
    readonly revisionId?: number;
    readonly text: string;
    readonly headHtml: string;
    readonly displayTitle: string;
    readonly subtitle: string;
    readonly indicators: readonly string[];
    readonly categoriesHtml: string;
    readonly modules: readonly string[];
    readonly moduleStyles: readonly string[];
    readonly javascriptConfig: Readonly<Record<string, unknown>>;
    readonly warnings: readonly ParseWarning[];
}

export interface SiteInformation {
    readonly siteName: string;
    readonly languageCode: string;
    readonly direction: 'ltr' | 'rtl';
    readonly articlePath: string;
    readonly scriptPath: string;
}
