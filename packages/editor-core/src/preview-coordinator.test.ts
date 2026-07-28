import type { PreviewRequest, PreviewResult } from '@wikione/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    PreviewCoordinator,
    type PreviewStatus,
} from './preview-coordinator.js';

const request = (clientRevision: number): PreviewRequest => ({
    wikiId: 'en-wikipedia',
    title: 'Sandbox',
    source: `Revision ${String(clientRevision)}`,
    contentModel: 'wikitext',
    clientRevision,
});

const result = (clientRevision: number): PreviewResult => ({
    clientRevision,
    renderUrl: `https://preview.example/previews/${String(clientRevision)}`,
    warnings: [],
    generatedAt: '2026-07-18T00:00:00.000Z',
    expiresAt: '2026-07-18T00:02:00.000Z',
});

afterEach(() => {
    vi.useRealTimers();
});

describe('PreviewCoordinator', () => {
    it('coalesces rapid changes and compiles only the latest revision', async () => {
        vi.useFakeTimers();
        const fetchPreview = vi.fn((input: PreviewRequest) =>
            Promise.resolve(result(input.clientRevision)),
        );
        const results: PreviewResult[] = [];
        const coordinator = new PreviewCoordinator(
            fetchPreview,
            {
                onStatus: () => undefined,
                onResult: (value) => results.push(value),
            },
            { delayMilliseconds: 500 },
        );

        coordinator.schedule(request(1));
        coordinator.schedule(request(2));
        await vi.advanceTimersByTimeAsync(500);

        expect(fetchPreview).toHaveBeenCalledTimes(1);
        expect(fetchPreview).toHaveBeenCalledWith(
            request(2),
            expect.any(AbortSignal),
        );
        expect(results.map((value) => value.clientRevision)).toEqual([2]);
    });

    it('ignores a late response after a newer edit is scheduled', async () => {
        vi.useFakeTimers();
        const resolvers = new Map<number, (value: PreviewResult) => void>();
        const signals = new Map<number, AbortSignal>();
        const fetchPreview = vi.fn(
            (input: PreviewRequest, signal: AbortSignal) =>
                new Promise<PreviewResult>((resolve) => {
                    resolvers.set(input.clientRevision, resolve);
                    signals.set(input.clientRevision, signal);
                }),
        );
        const results: PreviewResult[] = [];
        const statuses: PreviewStatus[] = [];
        const coordinator = new PreviewCoordinator(
            fetchPreview,
            {
                onStatus: (value) => statuses.push(value),
                onResult: (value) => results.push(value),
            },
            { delayMilliseconds: 10 },
        );

        coordinator.schedule(request(1));
        await vi.advanceTimersByTimeAsync(10);
        const firstSignal = signals.get(1);
        coordinator.schedule(request(2));
        expect(firstSignal?.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(10);
        resolvers.get(1)?.(result(1));
        resolvers.get(2)?.(result(2));
        await Promise.resolve();

        expect(results.map((value) => value.clientRevision)).toEqual([2]);
        expect(statuses.at(-1)?.phase).toBe('ready');
    });
});
