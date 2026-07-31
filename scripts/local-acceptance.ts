import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';

interface CheckResult {
    readonly durationMilliseconds: number;
    readonly name: string;
}

interface SessionCredentials {
    readonly cookie: string;
    readonly csrfToken: string;
    readonly password: string;
}

type JsonObject = Record<string, unknown>;

const checks: CheckResult[] = [];
const webOrigin = readLoopbackOrigin(
    'LOCAL_WEB_BASE_URL',
    'http://127.0.0.1:5173',
);
const apiOrigin = readLoopbackOrigin(
    'LOCAL_API_BASE_URL',
    'http://127.0.0.1:3000',
);
const previewOrigin = readLoopbackOrigin(
    'LOCAL_PREVIEW_BASE_URL',
    'http://127.0.0.1:4174',
);

try {
    await runAcceptance();
    process.stdout.write(
        `${JSON.stringify(
            {
                status: 'passed',
                checkedAt: new Date().toISOString(),
                checks,
            },
            undefined,
            4,
        )}\n`,
    );
} catch (error) {
    process.stderr.write(
        `${JSON.stringify(
            {
                status: 'failed',
                checkedAt: new Date().toISOString(),
                completedChecks: checks,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown local acceptance failure.',
            },
            undefined,
            4,
        )}\n`,
    );
    process.exitCode = 1;
}

async function runAcceptance(): Promise<void> {
    await check('web runtime and security policy', async () => {
        const response = await request(new URL('/', webOrigin));
        await expectStatus(response, 200, 'editor document');
        const html = await response.text();
        assert.match(html, /<div\s+id="app"><\/div>/u);
        assert.equal(response.headers.get('x-frame-options'), 'DENY');
        const policy = requiredHeader(response, 'content-security-policy');
        assert.match(
            policy,
            new RegExp(`connect-src ${escapeRegExp(apiOrigin.origin)}`, 'u'),
        );
        assert.match(
            policy,
            new RegExp(`frame-src ${escapeRegExp(previewOrigin.origin)}`, 'u'),
        );

        const runtime = await request(new URL('/runtime-config.js', webOrigin));
        await expectStatus(runtime, 200, 'runtime configuration');
        assert.match(
            await runtime.text(),
            new RegExp(escapeRegExp(`apiBaseUrl:"${apiOrigin.origin}"`), 'u'),
        );
    });

    await check('API and preview dependency readiness', async () => {
        const api = await request(new URL('/readyz', apiOrigin));
        await expectStatus(api, 200, 'API readiness');
        assert.equal(stringAt(await readObject(api), 'status'), 'ready');

        const preview = await request(new URL('/readyz', previewOrigin));
        await expectStatus(preview, 200, 'preview readiness');
        assert.equal(stringAt(await readObject(preview), 'status'), 'ready');
    });

    await check('exact-origin CORS and OpenAPI contract', async () => {
        const cors = await request(new URL('/livez', apiOrigin), {
            headers: { Origin: webOrigin.origin },
        });
        await expectStatus(cors, 200, 'API liveness');
        assert.equal(
            cors.headers.get('access-control-allow-origin'),
            webOrigin.origin,
        );
        assert.equal(
            cors.headers.get('access-control-allow-credentials'),
            'true',
        );

        const response = await request(new URL('/openapi.json', apiOrigin));
        await expectStatus(response, 200, 'OpenAPI document');
        const contract = await readObject(response);
        assert.equal(stringAt(contract, 'openapi'), '3.1.0');
        const paths = objectAt(contract, 'paths');
        for (const path of [
            '/v1/previews',
            '/v1/auth/register',
            '/v1/publish',
        ]) {
            assert.ok(
                Object.hasOwn(paths, path),
                `OpenAPI is missing ${path}.`,
            );
        }
    });

    const username = `audit${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
    const password = `Local-${randomBytes(18).toString('base64url')}!`;
    let credentials: SessionCredentials | undefined;
    let accountDeleted = false;

    try {
        credentials = await check(
            'PostgreSQL account and Redis session creation',
            async () => {
                const response = await jsonRequest(
                    new URL('/v1/auth/register', apiOrigin),
                    {
                        username,
                        displayName: 'Local acceptance account',
                        password,
                    },
                    { Origin: webOrigin.origin },
                );
                await expectStatus(response, 201, 'account registration');
                const setCookie = requiredHeader(response, 'set-cookie');
                const cookie = setCookie.split(';', 1)[0];
                assert.ok(cookie);
                const body = await readObject(response);
                const session = objectAt(body, 'session');
                const issued = {
                    cookie,
                    csrfToken: stringAt(session, 'csrfToken'),
                    password,
                };
                // Assign before the remaining assertions so finally can remove
                // the account if a cookie-policy regression is detected.
                credentials = issued;
                assert.match(setCookie, /(?:^|;\s*)HttpOnly(?:;|$)/iu);
                assert.match(setCookie, /(?:^|;\s*)SameSite=Lax(?:;|$)/iu);
                assert.doesNotMatch(setCookie, /(?:^|;\s*)Secure(?:;|$)/iu);
                assert.ok(cookie.startsWith('wikione_session_local='));
                assert.equal(session.authenticated, true);
                return issued;
            },
        );

        await check('authenticated session recovery', async () => {
            assert.ok(credentials);
            const response = await request(
                new URL('/v1/auth/session', apiOrigin),
                { headers: { Cookie: credentials.cookie } },
            );
            await expectStatus(response, 200, 'session recovery');
            const session = await readObject(response);
            assert.equal(session.authenticated, true);
            assert.equal(
                stringAt(objectAt(session, 'account'), 'username'),
                username,
            );
            assert.match(
                requiredHeader(response, 'cache-control'),
                /no-store/iu,
            );
        });

        await check('publishing remains safely disabled', async () => {
            const now = new Date().toISOString();
            const response = await jsonRequest(
                new URL('/v1/publish', apiOrigin),
                {
                    wikiId: 'en-wikipedia',
                    title: 'WikiOne local acceptance',
                    source: 'No edit may be submitted.',
                    baseSource: '',
                    editingStartedAt: now,
                    summary: 'Local acceptance safety-boundary check',
                    minor: false,
                    watchlist: 'preferences',
                },
                { Origin: webOrigin.origin },
            );
            await expectStatus(response, 503, 'disabled publishing boundary');
            assert.equal(
                stringAt(await readObject(response), 'code'),
                'wikimedia-oauth-unavailable',
            );
        });

        await check(
            'live Wikipedia compilation and preview isolation',
            async () => {
                const response = await jsonRequest(
                    new URL('/v1/previews', apiOrigin),
                    {
                        wikiId: 'en-wikipedia',
                        title: 'WikiOne local acceptance',
                        source: [
                            '== WikiOne local acceptance ==',
                            '',
                            'This text was compiled through MediaWiki.',
                            '',
                            '{| class="wikitable"',
                            '! Gate !! Result',
                            '|-',
                            '| Local preview || Passed',
                            '|}',
                        ].join('\n'),
                        contentModel: 'wikitext',
                        clientRevision: 1,
                    },
                    { Origin: webOrigin.origin },
                    90_000,
                );
                await expectStatus(response, 200, 'live preview compilation');
                const result = await readObject(response);
                assert.equal(result.clientRevision, 1);
                const renderUrl = new URL(stringAt(result, 'renderUrl'));
                assert.equal(renderUrl.origin, previewOrigin.origin);

                const preview = await request(renderUrl, {}, 30_000);
                await expectStatus(preview, 200, 'compiled preview document');
                assert.equal(preview.headers.get('set-cookie'), null);
                assert.match(
                    requiredHeader(preview, 'cache-control'),
                    /no-store/iu,
                );
                const policy = requiredHeader(
                    preview,
                    'content-security-policy',
                );
                assert.match(policy, /default-src 'none'/u);
                assert.match(
                    policy,
                    new RegExp(
                        `frame-ancestors[^;]*${escapeRegExp(webOrigin.origin)}`,
                        'u',
                    ),
                );
                const html = await preview.text();
                assert.match(html, /WikiOne local acceptance/u);
                assert.match(html, /<table\b/u);
            },
        );

        await check('account deletion and credential revocation', async () => {
            assert.ok(credentials);
            const response = await jsonRequest(
                new URL('/v1/account', apiOrigin),
                { password: credentials.password, confirmation: 'DELETE' },
                {
                    Cookie: credentials.cookie,
                    Origin: webOrigin.origin,
                    'X-WikiOne-CSRF': credentials.csrfToken,
                },
                undefined,
                'DELETE',
            );
            await expectStatus(response, 204, 'account deletion');
            accountDeleted = true;

            const login = await jsonRequest(
                new URL('/v1/auth/login', apiOrigin),
                { username, password },
                { Origin: webOrigin.origin },
            );
            await expectStatus(login, 401, 'deleted-account login');
        });
    } finally {
        if (credentials && !accountDeleted) {
            await jsonRequest(
                new URL('/v1/account', apiOrigin),
                { password: credentials.password, confirmation: 'DELETE' },
                {
                    Cookie: credentials.cookie,
                    Origin: webOrigin.origin,
                    'X-WikiOne-CSRF': credentials.csrfToken,
                },
                undefined,
                'DELETE',
            ).catch(() => undefined);
        }
    }
}

async function check<T>(name: string, action: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    const value = await action();
    checks.push({
        name,
        durationMilliseconds: Number(
            (performance.now() - startedAt).toFixed(2),
        ),
    });
    return value;
}

async function request(
    url: URL,
    init: RequestInit = {},
    timeoutMilliseconds = 15_000,
): Promise<Response> {
    return fetch(url, {
        ...init,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMilliseconds),
    });
}

async function jsonRequest(
    url: URL,
    body: JsonObject,
    headers: Record<string, string>,
    timeoutMilliseconds?: number,
    method = 'POST',
): Promise<Response> {
    return request(
        url,
        {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
        },
        timeoutMilliseconds,
    );
}

async function expectStatus(
    response: Response,
    expected: number,
    label: string,
): Promise<void> {
    if (response.status !== expected) {
        const body = (await response.text()).slice(0, 1_000);
        throw new Error(
            `${label} returned ${String(response.status)}; expected ${String(expected)}. ${body}`,
        );
    }
}

async function readObject(response: Response): Promise<JsonObject> {
    const value: unknown = await response.json();
    assert.ok(
        value !== null && typeof value === 'object' && !Array.isArray(value),
        'Expected a JSON object.',
    );
    return value as JsonObject;
}

function objectAt(value: JsonObject, key: string): JsonObject {
    const nested = value[key];
    assert.ok(
        nested !== null && typeof nested === 'object' && !Array.isArray(nested),
        `Expected ${key} to be an object.`,
    );
    return nested as JsonObject;
}

function stringAt(value: JsonObject, key: string): string {
    const nested = value[key];
    assert.equal(typeof nested, 'string', `Expected ${key} to be a string.`);
    return nested;
}

function requiredHeader(response: Response, name: string): string {
    const value = response.headers.get(name);
    assert.ok(value, `Response is missing the ${name} header.`);
    return value;
}

function readLoopbackOrigin(name: string, fallback: string): URL {
    const value = process.env[name]?.trim() || fallback;
    const url = new URL(value);
    if (
        url.origin !== value ||
        url.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    ) {
        throw new TypeError(`${name} must be an exact loopback HTTP origin.`);
    }
    return url;
}

function escapeRegExp(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
