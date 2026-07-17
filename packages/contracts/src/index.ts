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
    source: z.string(),
    baseRevision: baseRevisionSchema.optional(),
    fetchedAt: z.iso.datetime(),
});

export const previewRequestSchema = z.object({
    wikiId: wikiIdSchema,
    title: z.string().min(1).max(512),
    source: z.string(),
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
});

export const watchlistBehaviorSchema = z.enum([
    'preferences',
    'watch',
    'unwatch',
    'nochange',
]);

export const publishRequestSchema = z.object({
    wikiId: wikiIdSchema,
    title: z.string().min(1).max(512),
    source: z.string(),
    baseRevisionId: z.int().positive().optional(),
    baseTimestamp: z.iso.datetime().optional(),
    editingStartedAt: z.iso.datetime(),
    summary: z.string().trim().min(1).max(500),
    minor: z.boolean(),
    watchlist: watchlistBehaviorSchema,
});

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
export type PreviewRequest = z.infer<typeof previewRequestSchema>;
export type PreviewWarning = z.infer<typeof previewWarningSchema>;
export type PreviewResult = z.infer<typeof previewResultSchema>;
export type PublishRequest = z.infer<typeof publishRequestSchema>;
export type PublishResult = z.infer<typeof publishResultSchema>;
