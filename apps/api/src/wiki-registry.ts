import type { WikiDescriptor } from '@wikione/contracts';

/**
 * Wiki origins are deployment configuration, never client-controlled URLs.
 * Milestone 1 intentionally enables only English Wikipedia.
 */
export const supportedWikis: readonly WikiDescriptor[] = Object.freeze([
    Object.freeze({
        id: 'en-wikipedia',
        displayName: 'English Wikipedia',
        languageCode: 'en',
        direction: 'ltr',
        baseUrl: 'https://en.wikipedia.org',
        apiUrl: 'https://en.wikipedia.org/w/api.php',
    }),
]);

export function findSupportedWiki(wikiId: string): WikiDescriptor | undefined {
    return supportedWikis.find((wiki) => wiki.id === wikiId);
}
