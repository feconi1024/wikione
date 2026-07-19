import { describe, expect, it } from 'vitest';

import {
    accountDeletionRequestSchema,
    authenticationSuccessSchema,
    authenticationAvailabilitySchema,
    authenticationStartResultSchema,
    loginRequestSchema,
    pageSourceRequestSchema,
    previewRequestSchema,
    publishCapabilitySchema,
    publishPreparationResultSchema,
    publishRequestSchema,
    publishResultSchema,
    registrationRequestSchema,
    revisionCheckResultSchema,
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

    it('bounds public page and preview inputs', () => {
        expect(
            pageSourceRequestSchema.safeParse({
                wikiId: 'en-wikipedia',
                title: '   ',
            }).success,
        ).toBe(false);
        expect(
            previewRequestSchema.safeParse({
                wikiId: 'en-wikipedia',
                title: 'Sandbox',
                source: 'x'.repeat(500_001),
                contentModel: 'wikitext',
                clientRevision: 1,
            }).success,
        ).toBe(false);
    });

    it('requires an explicit edit summary', () => {
        const result = publishRequestSchema.safeParse({
            wikiId: 'en-wikipedia',
            title: 'User:Example/Sandbox',
            source: 'Hello',
            baseSource: '',
            editingStartedAt: '2026-07-17T00:00:00.000Z',
            summary: '   ',
            minor: false,
            watchlist: 'preferences',
        });

        expect(result.success).toBe(false);
        expect(
            publishRequestSchema.safeParse({
                wikiId: 'en-wikipedia',
                title: 'Earth',
                source: 'Text',
                baseSource: 'Old text',
                baseRevisionId: 42,
                editingStartedAt: '2026-07-17T00:00:00.000Z',
                summary: 'Update',
                minor: false,
                watchlist: 'preferences',
            }).success,
        ).toBe(false);
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

    it('represents OAuth as explicitly unavailable before registration', () => {
        expect(
            authenticationAvailabilitySchema.parse({
                firstParty: { available: true, provider: 'wikione' },
                wikimedia: {
                    available: false,
                    reason: 'oauth-registration-pending',
                    message: 'Registration is not ready.',
                },
            }),
        ).toEqual({
            firstParty: { available: true, provider: 'wikione' },
            wikimedia: {
                available: false,
                reason: 'oauth-registration-pending',
                message: 'Registration is not ready.',
            },
        });
    });

    it('parses anonymous and authenticated session states', () => {
        const states = [
            {
                authenticated: false,
                wikimedia: {
                    connected: false,
                    reason: 'oauth-registration-pending',
                    message: 'Approval pending.',
                },
            },
            {
                authenticated: true,
                account: {
                    provider: 'wikione',
                    accountId: 'bb2f82ee-29f2-41c9-bd38-630f1228a967',
                    username: 'Example',
                    displayName: 'Example editor',
                    createdAt: '2026-07-17T00:00:00.000Z',
                },
                csrfToken: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
                expiresAt: '2026-07-17T00:10:00.000Z',
                absoluteExpiresAt: '2026-07-17T08:00:00.000Z',
                wikimedia: {
                    connected: false,
                    reason: 'oauth-registration-pending',
                    message: 'Approval pending.',
                },
            },
        ];

        for (const state of states) {
            expect(sessionStatusSchema.safeParse(state).success).toBe(true);
        }
    });

    it('validates first-party account workflow payloads', () => {
        const registration = {
            username: 'Example',
            displayName: 'Example editor',
            password: 'correct horse battery staple',
        };
        expect(registrationRequestSchema.safeParse(registration).success).toBe(
            true,
        );
        expect(
            loginRequestSchema.safeParse({
                username: registration.username,
                password: registration.password,
            }).success,
        ).toBe(true);
        expect(
            accountDeletionRequestSchema.safeParse({
                password: registration.password,
                confirmation: 'keep',
            }).success,
        ).toBe(false);
        expect(
            authenticationSuccessSchema.safeParse({
                session: {
                    authenticated: true,
                    account: {
                        provider: 'wikione',
                        accountId: 'bb2f82ee-29f2-41c9-bd38-630f1228a967',
                        username: 'Example',
                        displayName: 'Example editor',
                        createdAt: '2026-07-17T00:00:00.000Z',
                    },
                    csrfToken: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
                    expiresAt: '2026-07-17T00:30:00.000Z',
                    absoluteExpiresAt: '2026-07-17T08:00:00.000Z',
                    wikimedia: {
                        connected: false,
                        reason: 'oauth-registration-pending',
                        message: 'Approval pending.',
                    },
                },
            }).success,
        ).toBe(true);
    });

    it('models revision readiness and the disabled publish capability', () => {
        expect(
            revisionCheckResultSchema.safeParse({
                status: 'changed',
                exists: true,
                currentRevision: {
                    id: 43,
                    timestamp: '2026-07-17T01:00:00.000Z',
                },
                latestSource: 'Remote text',
            }).success,
        ).toBe(true);
        expect(
            publishPreparationResultSchema.safeParse({
                status: 'ready',
                operation: 'create',
            }).success,
        ).toBe(true);
        expect(
            publishCapabilitySchema.parse({
                available: false,
                reason: 'oauth-registration-pending',
                message: 'Approval pending.',
            }).available,
        ).toBe(false);
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
