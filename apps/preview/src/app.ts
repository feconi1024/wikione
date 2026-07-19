import Fastify, {
    LogController,
    type FastifyInstance,
    type FastifyReply,
} from 'fastify';

import { previewBundleIdSchema } from '@wikione/contracts';
import { buildPreviewContentSecurityPolicy } from '@wikione/preview-document';
import { MemoryPreviewStore, type PreviewStore } from '@wikione/preview-store';

const defaultEditorOrigins = [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
] as const;

export interface BuildPreviewOptions {
    readonly logger?: boolean;
    readonly previewStore?: PreviewStore;
    readonly editorOrigins?: readonly string[];
}

/**
 * Creates the origin-isolated preview server. It can retrieve opaque bundles
 * but has no source-loading, authentication, session, or publishing route.
 */
export function buildPreviewApp(
    options: BuildPreviewOptions = {},
): FastifyInstance {
    const previewStore = options.previewStore ?? new MemoryPreviewStore();
    const editorOrigins = normalizeOrigins(
        options.editorOrigins ?? defaultEditorOrigins,
    );
    const frameAncestors = editorOrigins.join(' ');
    const app = Fastify({
        logger: options.logger ?? false,
        logController: new LogController({ disableRequestLogging: true }),
        requestIdHeader: 'x-request-id',
        trustProxy: false,
    });

    app.addHook('onSend', async (_request, reply) => {
        setCommonSecurityHeaders(reply);
    });
    app.addHook('onClose', async () => {
        await previewStore.close();
    });

    app.get('/healthz', async (_request, reply) => {
        reply.header(
            'Content-Security-Policy',
            `default-src 'none'; frame-ancestors ${frameAncestors}`,
        );
        return { status: 'ok' as const };
    });

    app.get<{ Params: { id: string } }>(
        '/previews/:id',
        async (request, reply) => {
            const parsedId = previewBundleIdSchema.safeParse(request.params.id);
            if (!parsedId.success) {
                return sendUnavailable(reply, frameAncestors);
            }

            const bundle = await previewStore.get(parsedId.data);
            if (!bundle || Date.parse(bundle.expiresAt) <= Date.now()) {
                return sendUnavailable(reply, frameAncestors);
            }

            const contentSecurityPolicy = [
                buildPreviewContentSecurityPolicy(bundle.wikiBaseUrl),
                `frame-ancestors ${frameAncestors}`,
            ].join('; ');
            await reply
                .header('Content-Security-Policy', contentSecurityPolicy)
                .type('text/html; charset=utf-8')
                .send(bundle.html);
        },
    );

    app.setNotFoundHandler(async (_request, reply) => {
        return sendUnavailable(reply, frameAncestors);
    });

    app.setErrorHandler(async (_error, _request, reply) => {
        reply.header(
            'Content-Security-Policy',
            `default-src 'none'; frame-ancestors ${frameAncestors}`,
        );
        await reply.status(500).send({
            code: 'preview-unavailable',
            message: 'The preview is temporarily unavailable.',
        });
    });

    return app;
}

function setCommonSecurityHeaders(reply: FastifyReply): void {
    reply.header('Cache-Control', 'private, no-store, max-age=0');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header(
        'Permissions-Policy',
        'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
    );
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
    );
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-XSS-Protection', '0');
}

async function sendUnavailable(
    reply: FastifyReply,
    frameAncestors: string,
): Promise<void> {
    reply.header(
        'Content-Security-Policy',
        `default-src 'none'; frame-ancestors ${frameAncestors}`,
    );
    await reply.status(404).send({
        code: 'preview-unavailable',
        message: 'This preview is invalid, expired, or unavailable.',
    });
}

function normalizeOrigins(values: readonly string[]): readonly string[] {
    if (values.length === 0) {
        throw new TypeError('At least one editor origin is required.');
    }
    return values.map((value) => {
        const url = new URL(value);
        if (
            url.origin !== value ||
            (url.protocol !== 'https:' &&
                !(url.protocol === 'http:' && isLoopbackHost(url.hostname)))
        ) {
            throw new TypeError(
                'Editor origins must be exact HTTPS origins, or loopback HTTP origins for local development.',
            );
        }
        return url.origin;
    });
}

function isLoopbackHost(hostname: string): boolean {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]'
    );
}
