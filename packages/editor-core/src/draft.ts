import type { BaseRevision } from '@wikione/contracts';

export const draftSchemaVersion = 1 as const;

export interface LocalDraft {
    readonly version: typeof draftSchemaVersion;
    readonly key: string;
    readonly wikiId: string;
    readonly title: string;
    readonly source: string;
    /** Exact source loaded at edit start; required for three-way conflict merge. */
    readonly baseSource?: string;
    readonly baseRevision?: BaseRevision;
    readonly updatedAt: string;
}

export function normalizeDraftTitle(title: string): string {
    return title.trim().replaceAll('_', ' ').replace(/\s+/gu, ' ');
}

export function createDraftKey(wikiId: string, title: string): string {
    const normalizedTitle = normalizeDraftTitle(title);
    return `v${String(draftSchemaVersion)}:${encodeURIComponent(wikiId)}:${encodeURIComponent(normalizedTitle)}`;
}

export function isLocalDraft(value: unknown): value is LocalDraft {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value as Readonly<Record<string, unknown>>;
    return (
        record.version === draftSchemaVersion &&
        typeof record.key === 'string' &&
        typeof record.wikiId === 'string' &&
        typeof record.title === 'string' &&
        typeof record.source === 'string' &&
        (record.baseSource === undefined ||
            typeof record.baseSource === 'string') &&
        typeof record.updatedAt === 'string' &&
        isOptionalBaseRevision(record.baseRevision)
    );
}

function isOptionalBaseRevision(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value as Readonly<Record<string, unknown>>;
    return (
        typeof record.id === 'number' &&
        Number.isSafeInteger(record.id) &&
        record.id > 0 &&
        typeof record.timestamp === 'string' &&
        !Number.isNaN(Date.parse(record.timestamp))
    );
}
