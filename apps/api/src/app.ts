import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';

export interface BuildApiOptions {
    readonly logger?: boolean;
}

/** Creates the API without opening a socket so tests can use Fastify injection. */
export async function buildApi(
    options: BuildApiOptions = {},
): Promise<FastifyInstance> {
    const app = Fastify({
        logger: options.logger ?? false,
        requestIdHeader: 'x-request-id',
        trustProxy: false,
    });

    await app.register(swagger, {
        openapi: {
            openapi: '3.1.0',
            info: {
                title: 'WikiOne API',
                description:
                    'Backend contract for the WikiOne MediaWiki editor.',
                version: '0.0.0',
            },
            tags: [
                { name: 'meta', description: 'Service metadata and health.' },
            ],
        },
    });

    app.get(
        '/healthz',
        {
            schema: {
                tags: ['meta'],
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['status'],
                        properties: {
                            status: { type: 'string', const: 'ok' },
                        },
                    },
                },
            },
        },
        () => ({ status: 'ok' as const }),
    );

    app.get(
        '/v1/meta/contracts',
        {
            schema: {
                tags: ['meta'],
                response: {
                    200: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['apiVersion', 'contractPackage'],
                        properties: {
                            apiVersion: { type: 'string' },
                            contractPackage: { type: 'string' },
                        },
                    },
                },
            },
        },
        () => ({
            apiVersion: 'v1',
            contractPackage: '@wikione/contracts@0.0.0',
        }),
    );

    app.get(
        '/openapi.json',
        {
            schema: { hide: true },
        },
        async (_request, reply) => {
            await reply.type('application/json').send(app.swagger());
        },
    );

    return app;
}
