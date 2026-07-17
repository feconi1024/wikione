import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { buildPreviewContentSecurityPolicy } from '@wikione/preview-document';

import { renderManifestSchema } from './manifest.js';

export interface PreviewServerOptions {
    readonly artifactDirectory: string;
    readonly logger?: boolean;
    readonly frameAncestors?: readonly string[];
}

export async function buildPreviewServer(
    options: PreviewServerOptions,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: options.logger ?? false });

    app.get('/healthz', () => ({ status: 'ok' as const }));
    app.get('/previews/:id', async (request, reply) => {
        const parameters = request.params as { readonly id?: unknown };
        if (
            typeof parameters.id !== 'string' ||
            !/^[a-z0-9-]+$/u.test(parameters.id)
        ) {
            await reply.code(404).send({ code: 'not-found' });
            return;
        }
        const manifest = renderManifestSchema.parse(
            JSON.parse(
                await readFile(
                    resolve(options.artifactDirectory, 'manifest.json'),
                    'utf8',
                ),
            ),
        );
        const result = manifest.results.find(
            (entry) => entry.id === parameters.id,
        );
        if (!result) {
            await reply.code(404).send({ code: 'not-found' });
            return;
        }
        const html = await readFile(
            resolve(options.artifactDirectory, result.outputFile),
            'utf8',
        );
        const frameAncestors = options.frameAncestors ?? [
            'http://localhost:4173',
        ];
        await reply
            .header('Cache-Control', 'no-store')
            .header('Cross-Origin-Resource-Policy', 'cross-origin')
            .header(
                'Content-Security-Policy',
                `${buildPreviewContentSecurityPolicy(result.wikiBaseUrl)}; frame-ancestors ${frameAncestors.join(' ')}`,
            )
            .header(
                'Permissions-Policy',
                'camera=(), geolocation=(), microphone=()',
            )
            .header('Referrer-Policy', 'no-referrer')
            .header('X-Content-Type-Options', 'nosniff')
            .type('text/html; charset=utf-8')
            .send(html);
    });

    return app;
}
