import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflowsDirectory = resolve(
    import.meta.dirname,
    '../../.github/workflows',
);
const pinnedActionReference = /^[^/\s]+\/[^@\s]+@[0-9a-f]{40}$/u;
const safeSetupTrivy =
    'aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514';
const safeTrivyAction =
    'aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1';

describe('GitHub workflow supply-chain gate', () => {
    it('pins every third-party action to an immutable commit', async () => {
        const workflows = await readWorkflows();
        const unpinned: string[] = [];

        for (const [file, source] of workflows) {
            for (const match of source.matchAll(/^\s*- uses:\s*(\S+)/gmu)) {
                const reference = match[1] ?? '';
                if (
                    !reference.startsWith('./') &&
                    !pinnedActionReference.test(reference)
                ) {
                    unpinned.push(`${file}: ${reference}`);
                }
            }
        }

        expect(unpinned).toEqual([]);
    });

    it('uses only the known-safe post-incident Trivy chain', async () => {
        const workflows = await readWorkflows();
        const findings: string[] = [];

        for (const [file, source] of workflows) {
            const setupReferences = [
                ...source.matchAll(/uses:\s*(aquasecurity\/setup-trivy@\S+)/gu),
            ];
            const scanReferences = [
                ...source.matchAll(
                    /uses:\s*(aquasecurity\/trivy-action@\S+)/gu,
                ),
            ];
            if (setupReferences.length + scanReferences.length === 0) {
                continue;
            }

            if (!/^\s*TRIVY_VERSION:\s*v0\.69\.3\s*$/mu.test(source)) {
                findings.push(`${file}: trusted Trivy version is not fixed`);
            }
            for (const match of setupReferences) {
                if (match[1] !== safeSetupTrivy) {
                    findings.push(
                        `${file}: unsafe setup reference ${match[1]}`,
                    );
                }
            }
            for (const match of scanReferences) {
                if (match[1] !== safeTrivyAction) {
                    findings.push(`${file}: unsafe scan reference ${match[1]}`);
                }
                const step = workflowStepAt(source, match.index ?? 0);
                if (!/^\s*skip-setup-trivy:\s*true\s*$/mu.test(step)) {
                    findings.push(`${file}: Trivy scan permits nested setup`);
                }
            }
        }

        expect(findings).toEqual([]);
    });
});

async function readWorkflows(): Promise<Map<string, string>> {
    const files = (await readdir(workflowsDirectory)).filter((file) =>
        /\.ya?ml$/u.test(file),
    );
    return new Map(
        await Promise.all(
            files.map(
                async (file) =>
                    [
                        file,
                        await readFile(
                            resolve(workflowsDirectory, file),
                            'utf8',
                        ),
                    ] as const,
            ),
        ),
    );
}

function workflowStepAt(source: string, actionIndex: number): string {
    const stepStart = source.lastIndexOf('\n            - ', actionIndex);
    const nextStep = source.indexOf('\n            - ', actionIndex + 1);
    return source.slice(
        stepStart < 0 ? 0 : stepStart,
        nextStep < 0 ? source.length : nextStep,
    );
}
