import { z } from 'zod';

const featureSummarySchema = z.object({
    images: z.int().nonnegative(),
    figures: z.int().nonnegative(),
    tables: z.int().nonnegative(),
    mathElements: z.int().nonnegative(),
    referenceLists: z.int().nonnegative(),
    audioElements: z.int().nonnegative(),
    videoElements: z.int().nonnegative(),
    interactiveElements: z.int().nonnegative(),
});

export const renderResultSchema = z.object({
    id: z.string(),
    label: z.string(),
    wikiBaseUrl: z.url(),
    apiUrl: z.url(),
    title: z.string(),
    revisionId: z.int().positive().optional(),
    revisionTimestamp: z.iso.datetime().optional(),
    languageCode: z.string(),
    direction: z.enum(['ltr', 'rtl']),
    sourceCharacters: z.int().nonnegative(),
    outputFile: z.string(),
    modules: z.array(z.string()),
    moduleStyles: z.array(z.string()),
    warnings: z.array(
        z.object({
            code: z.string().optional(),
            message: z.string(),
        }),
    ),
    features: featureSummarySchema,
});

export const renderManifestSchema = z.object({
    generatedAt: z.iso.datetime(),
    userAgent: z.string(),
    results: z.array(renderResultSchema),
});

export type RenderResult = z.infer<typeof renderResultSchema>;
export type RenderManifest = z.infer<typeof renderManifestSchema>;
