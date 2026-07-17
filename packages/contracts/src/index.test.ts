import { describe, expect, it } from 'vitest';

import {
    authenticationStartResultSchema,
    previewRequestSchema,
    publishRequestSchema,
    publishResultSchema,
    sessionStatusSchema,
    wikiDescriptorSchema,
} from './index.js';

describe('shared contracts', () => {
    it('accepts a valid Wikipedia descriptor', () => {
        const parsed = wikiDescriptorSchema.parse({
            id: 'en-wikipedia',
            displayName: 'English Wikipedia',
            languageCode: 'en',
            direction: 'ltr',
            baseUrl: 'https://en.wikipedia.org',
            apiUrl: 'https://en.wikipedia.org/w/api.php',
        });

        expect(parsed.id).toBe('en-wikipedia');
    });

    it('rejects preview revisions below zero', () => {
        const result = previewRequestSchema.safeParse({
            wikiId: 'en-wikipedia',
            title: 'Earth',
            source: 'Earth',
            contentModel: 'wikitext',
            clientRevision: -1,
        });

        expect(result.success).toBe(false);
    });

    it('requires an explicit edit summary', () => {
        const result = publishRequestSchema.safeParse({
            wikiId: 'en-wikipedia',
            title: 'User:Example/Sandbox',
            source: 'Hello',
            editingStartedAt: '2026-07-17T00:00:00.000Z',
            summary: '   ',
            minor: false,
            watchlist: 'preferences',
        });

        expect(result.success).toBe(false);
    });

    it('models OAuth handoff without exposing state or tokens', () => {
        expect(
            authenticationStartResultSchema.safeParse({
                authorizationUrl:
                    'https://meta.wikimedia.org/w/rest.php/oauth2/authorize',
                expiresAt: '2026-07-17T00:10:00.000Z',
            }).success,
        ).toBe(true);
        expect(
            authenticationStartResultSchema.safeParse({
                authorizationUrl: 'http://example.test/authorize',
                expiresAt: '2026-07-17T00:10:00.000Z',
            }).success,
        ).toBe(false);
    });

    it('parses anonymous and authenticated session states', () => {
        const states = [
            { authenticated: false },
            {
                authenticated: true,
                identity: {
                    wikiId: 'en-wikipedia',
                    username: 'Example',
                    userId: 42,
                },
                expiresAt: '2026-07-17T00:10:00.000Z',
            },
        ];

        for (const state of states) {
            expect(sessionStatusSchema.safeParse(state).success).toBe(true);
        }
    });

    it('parses every publish-result branch', () => {
        const branches = [
            {
                status: 'published',
                newRevisionId: 42,
                pageUrl: 'https://en.wikipedia.org/wiki/Earth',
                revisionUrl: 'https://en.wikipedia.org/w/index.php?oldid=42',
            },
            {
                status: 'conflict',
                latestRevision: {
                    id: 43,
                    timestamp: '2026-07-17T00:00:00.000Z',
                },
                latestSource: 'Remote text',
            },
            {
                status: 'authentication-required',
                loginUrl: 'https://editor.example/auth/wikimedia/start',
            },
            {
                status: 'rejected',
                code: 'protectedpage',
                message: 'This page is protected.',
                canRetry: false,
            },
        ];

        for (const branch of branches) {
            expect(publishResultSchema.safeParse(branch).success).toBe(true);
        }
    });
});
