import { z } from 'zod';

export const wikiIdSchema = z
    .string()
    .regex(
        /^[a-z0-9-]{2,40}$/,
        'Wiki IDs use lowercase letters, digits, and hyphens.',
    );

export const wikiDescriptorSchema = z.object({
    id: wikiIdSchema,
    displayName: z.string().min(1).max(100),
    languageCode: z.string().min(2).max(20),
    direction: z.enum(['ltr', 'rtl']),
    baseUrl: z.url().startsWith('https://'),
    apiUrl: z.url().startsWith('https://'),
});

export const baseRevisionSchema = z.object({
    id: z.int().positive(),
    timestamp: z.iso.datetime(),
});

export const pageSourceSchema = z.object({
    wikiId: wikiIdSchema,
    title: z.string().min(1).max(512),
    exists: z.boolean(),
    contentModel: z.literal('wikitext'),
    source: z.string().max(2_000_000),
    baseRevision: baseRevisionSchema.optional(),
    fetchedAt: z.iso.datetime(),
});

export const pageSourceRequestSchema = z.object({
    wikiId: wikiIdSchema,
    title: z.string().trim().min(1).max(512),
});

export const previewRequestSchema = z.object({
    wikiId: wikiIdSchema,
    title: z.string().min(1).max(512),
    source: z.string().max(500_000),
    contentModel: z.literal('wikitext'),
    clientRevision: z.int().nonnegative(),
});

export const previewWarningSchema = z.object({
    severity: z.enum(['warning', 'error']),
    code: z.string().min(1).max(100).optional(),
    message: z.string().min(1).max(2_000),
});

export const previewResultSchema = z.object({
    clientRevision: z.int().nonnegative(),
    renderUrl: z.url(),
    warnings: z.array(previewWarningSchema),
    generatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
});

export const previewBundleIdSchema = z
    .string()
    .regex(
        /^[A-Za-z0-9_-]{32}$/u,
        'Preview IDs must be opaque base64url values.',
    );

export const oauthUnavailableReasonSchema = z.literal(
    'oauth-registration-pending',
);

export const wikimediaConnectionSchema = z.object({
    connected: z.literal(false),
    reason: oauthUnavailableReasonSchema,
    message: z.string().min(1).max(500),
});

export const authenticationAvailabilitySchema = z.object({
    firstParty: z.object({
        available: z.literal(true),
        provider: z.literal('wikione'),
    }),
    wikimedia: z.object({
        available: z.literal(false),
        reason: oauthUnavailableReasonSchema,
        message: z.string().min(1).max(500),
    }),
});

export const apiErrorSchema = z.object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(500),
    requestId: z.string().min(1).max(200).optional(),
});

export const authenticationStartResultSchema = z.object({
    authorizationUrl: z.url().startsWith('https://'),
    expiresAt: z.iso.datetime(),
});

export const usernameSchema = z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(
        /^[\p{L}\p{N}][\p{L}\p{N}_.-]*$/u,
        'Usernames may contain letters, numbers, dots, underscores, and hyphens.',
    );

export const displayNameSchema = z.string().trim().min(1).max(80);
export const passwordSchema = z.string().min(12).max(128);

export const registrationRequestSchema = z.object({
    username: usernameSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
});

export const loginRequestSchema = z.object({
    username: usernameSchema,
    password: z.string().min(1).max(128),
});

export const accountIdentitySchema = z.object({
    provider: z.literal('wikione'),
    accountId: z.uuid(),
    username: usernameSchema,
    displayName: displayNameSchema,
    createdAt: z.iso.datetime(),
});

const anonymousSessionStatusSchema = z.object({
    authenticated: z.literal(false),
    wikimedia: wikimediaConnectionSchema,
});

const authenticatedSessionStatusSchema = z.object({
    authenticated: z.literal(true),
    account: accountIdentitySchema,
    csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    expiresAt: z.iso.datetime(),
    absoluteExpiresAt: z.iso.datetime(),
    wikimedia: wikimediaConnectionSchema,
});

export const sessionStatusSchema = z.discriminatedUnion('authenticated', [
    anonymousSessionStatusSchema,
    authenticatedSessionStatusSchema,
]);

export const accountUpdateRequestSchema = z.object({
    displayName: displayNameSchema,
});

export const passwordChangeRequestSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
});

export const accountDeletionRequestSchema = z.object({
    password: z.string().min(1).max(128),
    confirmation: z.literal('DELETE'),
});

export const authenticationSuccessSchema = z.object({
    session: authenticatedSessionStatusSchema,
});

export const watchlistBehaviorSchema = z.enum([
    'preferences',
    'watch',
    'unwatch',
    'nochange',
]);

export const publishRequestSchema = z
    .object({
        wikiId: wikiIdSchema,
        title: z.string().min(1).max(512),
        source: z.string().max(500_000),
        baseSource: z.string().max(500_000),
        baseRevisionId: z.int().positive().optional(),
        baseTimestamp: z.iso.datetime().optional(),
        editingStartedAt: z.iso.datetime(),
        summary: z.string().trim().min(1).max(500),
        minor: z.boolean(),
        watchlist: watchlistBehaviorSchema,
    })
    .refine(
        (value) =>
            (value.baseRevisionId === undefined) ===
            (value.baseTimestamp === undefined),
        {
            message:
                'Base revision ID and timestamp must be provided together.',
        },
    );

export const revisionCheckRequestSchema = z.object({
    wikiId: wikiIdSchema,
    title: z.string().trim().min(1).max(512),
    baseRevisionId: z.int().positive().optional(),
});

const currentRevisionSchema = z.object({
    id: z.int().positive(),
    timestamp: z.iso.datetime(),
});

export const revisionCheckResultSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('unchanged'),
        exists: z.literal(true),
        currentRevision: currentRevisionSchema,
    }),
    z.object({
        status: z.literal('changed'),
        exists: z.literal(true),
        currentRevision: currentRevisionSchema,
        latestSource: z.string().max(2_000_000),
    }),
    z.object({
        status: z.literal('missing'),
        exists: z.literal(false),
    }),
    z.object({
        status: z.literal('created'),
        exists: z.literal(true),
        currentRevision: currentRevisionSchema,
        latestSource: z.string().max(2_000_000),
    }),
]);

export const publishCapabilitySchema = z.object({
    available: z.literal(false),
    reason: oauthUnavailableReasonSchema,
    message: z.string().min(1).max(500),
});

export const publishPreparationRequestSchema = publishRequestSchema;

export const normalizedPublishErrorSchema = z.object({
    category: z.enum([
        'edit-conflict',
        'abuse-filter',
        'captcha',
        'protected-page',
        'permission-denied',
        'rate-limited',
        'bad-token',
        'read-only',
        'upstream-unavailable',
        'verification-failed',
        'unknown',
    ]),
    message: z.string().min(1).max(2_000),
    canRetry: z.boolean(),
    filterDescription: z.string().min(1).max(500).optional(),
});

export const publishPreparationResultSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('ready'),
        operation: z.enum(['create', 'update']),
        latestRevision: currentRevisionSchema.optional(),
    }),
    z.object({
        status: z.literal('conflict'),
        reason: z.enum(['revision-changed', 'page-created', 'page-deleted']),
        latestRevision: currentRevisionSchema.optional(),
        latestSource: z.string().max(2_000_000),
    }),
]);

const publishedResultSchema = z.object({
    status: z.literal('published'),
    oldRevisionId: z.int().positive().optional(),
    newRevisionId: z.int().positive(),
    pageUrl: z.url(),
    revisionUrl: z.url(),
});

const conflictResultSchema = z.object({
    status: z.literal('conflict'),
    latestRevision: baseRevisionSchema,
    latestSource: z.string(),
});

const authenticationRequiredResultSchema = z.object({
    status: z.literal('authentication-required'),
    loginUrl: z.url(),
});

const rejectedResultSchema = z.object({
    status: z.literal('rejected'),
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(2_000),
    canRetry: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
});

export const publishResultSchema = z.discriminatedUnion('status', [
    publishedResultSchema,
    conflictResultSchema,
    authenticationRequiredResultSchema,
    rejectedResultSchema,
]);

export type WikiDescriptor = z.infer<typeof wikiDescriptorSchema>;
export type BaseRevision = z.infer<typeof baseRevisionSchema>;
export type PageSource = z.infer<typeof pageSourceSchema>;
export type PageSourceRequest = z.infer<typeof pageSourceRequestSchema>;
export type PreviewRequest = z.infer<typeof previewRequestSchema>;
export type PreviewWarning = z.infer<typeof previewWarningSchema>;
export type PreviewResult = z.infer<typeof previewResultSchema>;
export type AuthenticationAvailability = z.infer<
    typeof authenticationAvailabilitySchema
>;
export type WikimediaConnection = z.infer<typeof wikimediaConnectionSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type AuthenticationStartResult = z.infer<
    typeof authenticationStartResultSchema
>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type AccountIdentity = z.infer<typeof accountIdentitySchema>;
export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AccountUpdateRequest = z.infer<typeof accountUpdateRequestSchema>;
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>;
export type AccountDeletionRequest = z.infer<
    typeof accountDeletionRequestSchema
>;
export type AuthenticationSuccess = z.infer<typeof authenticationSuccessSchema>;
export type PublishRequest = z.infer<typeof publishRequestSchema>;
export type WatchlistBehavior = z.infer<typeof watchlistBehaviorSchema>;
export type PublishResult = z.infer<typeof publishResultSchema>;
export type RevisionCheckRequest = z.infer<typeof revisionCheckRequestSchema>;
export type RevisionCheckResult = z.infer<typeof revisionCheckResultSchema>;
export type PublishCapability = z.infer<typeof publishCapabilitySchema>;
export type PublishPreparationRequest = z.infer<
    typeof publishPreparationRequestSchema
>;
export type PublishPreparationResult = z.infer<
    typeof publishPreparationResultSchema
>;
export type NormalizedPublishError = z.infer<
    typeof normalizedPublishErrorSchema
>;
