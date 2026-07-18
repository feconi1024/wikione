import type { PreviewRequest, PreviewResult } from '@wikione/contracts';

export type PreviewPhase =
    'idle' | 'scheduled' | 'compiling' | 'ready' | 'error';

export interface PreviewStatus {
    readonly phase: PreviewPhase;
    readonly clientRevision?: number;
    readonly message?: string;
}

export interface PreviewCoordinatorCallbacks {
    readonly onStatus: (status: PreviewStatus) => void;
    readonly onResult: (result: PreviewResult) => void;
}

export type PreviewFetcher = (
    request: PreviewRequest,
    signal: AbortSignal,
) => Promise<PreviewResult>;

export interface PreviewCoordinatorOptions {
    readonly delayMilliseconds?: number;
}

/**
 * Coalesces rapid edits, cancels superseded requests, and rejects late results.
 * The coordinator is deliberately framework-independent so race behavior can
 * be tested without a browser component.
 */
export class PreviewCoordinator {
    readonly #fetchPreview: PreviewFetcher;
    readonly #callbacks: PreviewCoordinatorCallbacks;
    readonly #delayMilliseconds: number;
    #timer: ReturnType<typeof setTimeout> | undefined;
    #controller: AbortController | undefined;
    #latestRevision = -1;
    #disposed = false;

    public constructor(
        fetchPreview: PreviewFetcher,
        callbacks: PreviewCoordinatorCallbacks,
        options: PreviewCoordinatorOptions = {},
    ) {
        this.#fetchPreview = fetchPreview;
        this.#callbacks = callbacks;
        this.#delayMilliseconds = options.delayMilliseconds ?? 650;
    }

    public schedule(request: PreviewRequest): void {
        if (this.#disposed) {
            return;
        }
        this.#latestRevision = request.clientRevision;
        this.#cancelPendingWork();
        this.#callbacks.onStatus({
            phase: 'scheduled',
            clientRevision: request.clientRevision,
        });
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            void this.#compile(request);
        }, this.#delayMilliseconds);
    }

    public cancel(): void {
        this.#latestRevision += 1;
        this.#cancelPendingWork();
        if (!this.#disposed) {
            this.#callbacks.onStatus({ phase: 'idle' });
        }
    }

    public dispose(): void {
        this.#disposed = true;
        this.#cancelPendingWork();
    }

    async #compile(request: PreviewRequest): Promise<void> {
        const controller = new AbortController();
        this.#controller = controller;
        this.#callbacks.onStatus({
            phase: 'compiling',
            clientRevision: request.clientRevision,
        });

        try {
            const result = await this.#fetchPreview(request, controller.signal);
            if (
                this.#disposed ||
                controller.signal.aborted ||
                request.clientRevision !== this.#latestRevision ||
                result.clientRevision !== this.#latestRevision
            ) {
                return;
            }
            this.#callbacks.onResult(result);
            this.#callbacks.onStatus({
                phase: 'ready',
                clientRevision: result.clientRevision,
            });
        } catch (error) {
            if (
                this.#disposed ||
                controller.signal.aborted ||
                request.clientRevision !== this.#latestRevision
            ) {
                return;
            }
            this.#callbacks.onStatus({
                phase: 'error',
                clientRevision: request.clientRevision,
                message: toSafeErrorMessage(error),
            });
        } finally {
            if (this.#controller === controller) {
                this.#controller = undefined;
            }
        }
    }

    #cancelPendingWork(): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
            this.#timer = undefined;
        }
        this.#controller?.abort();
        this.#controller = undefined;
    }
}

function toSafeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message.slice(0, 500);
    }
    return 'Preview compilation failed.';
}
