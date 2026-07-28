import {
    authenticationSuccessSchema,
    pageSourceSchema,
    publishCapabilitySchema,
    publishPreparationResultSchema,
    previewResultSchema,
    sessionStatusSchema,
    type AccountDeletionRequest,
    type AccountUpdateRequest,
    type AuthenticationSuccess,
    type LoginRequest,
    type PageSource,
    type PreviewRequest,
    type PreviewResult,
    type PublishCapability,
    type PublishPreparationRequest,
    type PublishPreparationResult,
    type RegistrationRequest,
    type SessionStatus,
    type WikiDescriptor,
    wikiDescriptorSchema,
} from '@wikione/contracts';

const defaultApiBaseUrl = 'http://127.0.0.1:3000';

interface WikiOneRuntimeConfig {
    readonly apiBaseUrl?: string;
}

export class WikiOneApiClient {
    readonly #baseUrl: URL;

    public constructor(baseUrl = readDefaultApiBaseUrl()) {
        this.#baseUrl = new URL(ensureTrailingSlash(baseUrl));
    }

    public async listWikis(signal?: AbortSignal): Promise<WikiDescriptor[]> {
        const payload = await this.#request(
            'v1/wikis',
            signal ? { signal } : {},
        );
        return wikiDescriptorSchema.array().parse(payload);
    }

    public async loadPage(
        wikiId: string,
        title: string,
        signal?: AbortSignal,
    ): Promise<PageSource> {
        const payload = await this.#request('v1/pages/source', {
            method: 'POST',
            body: JSON.stringify({ wikiId, title }),
            ...(signal ? { signal } : {}),
        });
        return pageSourceSchema.parse(payload);
    }

    public async compilePreview(
        request: PreviewRequest,
        signal: AbortSignal,
    ): Promise<PreviewResult> {
        const payload = await this.#request('v1/previews', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
        return previewResultSchema.parse(payload);
    }

    public async getSession(signal?: AbortSignal): Promise<SessionStatus> {
        const payload = await this.#request(
            'v1/auth/session',
            signal ? { signal } : {},
        );
        return sessionStatusSchema.parse(payload);
    }

    public async register(
        request: RegistrationRequest,
    ): Promise<AuthenticationSuccess> {
        return this.#authenticationRequest('v1/auth/register', request);
    }

    public async login(request: LoginRequest): Promise<AuthenticationSuccess> {
        return this.#authenticationRequest('v1/auth/login', request);
    }

    public async refresh(csrfToken: string): Promise<AuthenticationSuccess> {
        return this.#authenticationRequest('v1/auth/refresh', {}, csrfToken);
    }

    public async logout(csrfToken: string, all = false): Promise<void> {
        await this.#request(all ? 'v1/auth/logout-all' : 'v1/auth/logout', {
            method: 'POST',
            headers: { 'X-WikiOne-CSRF': csrfToken },
        });
    }

    public async updateAccount(
        request: AccountUpdateRequest,
        csrfToken: string,
    ): Promise<AuthenticationSuccess> {
        const payload = await this.#request('v1/account', {
            method: 'PATCH',
            body: JSON.stringify(request),
            headers: { 'X-WikiOne-CSRF': csrfToken },
        });
        return authenticationSuccessSchema.parse(payload);
    }

    public async changePassword(
        request: {
            readonly currentPassword: string;
            readonly newPassword: string;
        },
        csrfToken: string,
    ): Promise<AuthenticationSuccess> {
        return this.#authenticationRequest(
            'v1/account/password',
            request,
            csrfToken,
        );
    }

    public async deleteAccount(
        request: AccountDeletionRequest,
        csrfToken: string,
    ): Promise<void> {
        await this.#request('v1/account', {
            method: 'DELETE',
            body: JSON.stringify(request),
            headers: { 'X-WikiOne-CSRF': csrfToken },
        });
    }

    public async getPublishCapability(): Promise<PublishCapability> {
        return publishCapabilitySchema.parse(
            await this.#request('v1/publish/capability', {}),
        );
    }

    public async preparePublish(
        request: PublishPreparationRequest,
    ): Promise<PublishPreparationResult> {
        return publishPreparationResultSchema.parse(
            await this.#request('v1/publish/prepare', {
                method: 'POST',
                body: JSON.stringify(request),
            }),
        );
    }

    async #authenticationRequest(
        path: string,
        request: object,
        csrfToken?: string,
    ): Promise<AuthenticationSuccess> {
        const payload = await this.#request(path, {
            method: 'POST',
            body: JSON.stringify(request),
            ...(csrfToken ? { headers: { 'X-WikiOne-CSRF': csrfToken } } : {}),
        });
        return authenticationSuccessSchema.parse(payload);
    }

    async #request(path: string, init: RequestInit): Promise<unknown> {
        const response = await fetch(new URL(path, this.#baseUrl), {
            ...init,
            headers: {
                Accept: 'application/json',
                ...init.headers,
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            },
            credentials: 'include',
            redirect: 'error',
        });
        const payload = (await response.json().catch(() => undefined)) as
            Readonly<Record<string, unknown>> | undefined;
        if (!response.ok) {
            const message =
                typeof payload?.message === 'string'
                    ? payload.message
                    : `WikiOne API returned HTTP ${String(response.status)}.`;
            const code =
                typeof payload?.code === 'string'
                    ? payload.code.slice(0, 100)
                    : 'api-error';
            throw new WikiOneApiError(
                message.slice(0, 500),
                code,
                response.status,
            );
        }
        return payload;
    }
}

function readDefaultApiBaseUrl(): string {
    const runtimeConfig = (
        globalThis as typeof globalThis & {
            readonly __WIKIONE_RUNTIME_CONFIG__?: WikiOneRuntimeConfig;
        }
    ).__WIKIONE_RUNTIME_CONFIG__;
    return (
        runtimeConfig?.apiBaseUrl ??
        import.meta.env.VITE_API_BASE_URL ??
        defaultApiBaseUrl
    );
}

export class WikiOneApiError extends Error {
    public readonly code: string;
    public readonly status: number;

    public constructor(message: string, code: string, status: number) {
        super(message);
        this.name = 'WikiOneApiError';
        this.code = code;
        this.status = status;
    }
}

function ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
}
