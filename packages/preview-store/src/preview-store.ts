import { previewBundleIdSchema } from '@wikione/contracts';

export interface PreviewBundle {
    readonly html: string;
    readonly wikiBaseUrl: string;
    readonly createdAt: string;
    readonly expiresAt: string;
}

export interface PreviewStore {
    readonly put: (
        id: string,
        bundle: PreviewBundle,
        ttlMilliseconds: number,
    ) => Promise<void>;
    readonly get: (id: string) => Promise<PreviewBundle | undefined>;
    readonly close: () => Promise<void>;
}

export function assertPreviewBundleId(id: string): void {
    previewBundleIdSchema.parse(id);
}

export function isPreviewBundle(value: unknown): value is PreviewBundle {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value as Readonly<Record<string, unknown>>;
    if (
        typeof record.html !== 'string' ||
        typeof record.wikiBaseUrl !== 'string' ||
        typeof record.createdAt !== 'string' ||
        typeof record.expiresAt !== 'string' ||
        Number.isNaN(Date.parse(record.createdAt)) ||
        Number.isNaN(Date.parse(record.expiresAt))
    ) {
        return false;
    }
    try {
        const baseUrl = new URL(record.wikiBaseUrl);
        return (
            baseUrl.protocol === 'https:' &&
            !baseUrl.username &&
            !baseUrl.password &&
            !baseUrl.search &&
            !baseUrl.hash
        );
    } catch {
        return false;
    }
}
