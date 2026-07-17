import { buildApi } from './app.js';

const port = readPort(process.env.API_PORT, 3_000);
const host = process.env.API_HOST?.trim() || '127.0.0.1';
const app = await buildApi({ logger: true });

try {
    await app.listen({ host, port });
} catch (error: unknown) {
    app.log.error(error);
    process.exitCode = 1;
}

function readPort(value: string | undefined, fallback: number): number {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        throw new RangeError(`Invalid API_PORT: ${value}`);
    }
    return parsed;
}
