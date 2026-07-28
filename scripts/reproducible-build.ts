import { spawnSync } from 'node:child_process';

const targets = ['api', 'preview', 'web'] as const;
const suffix =
    process.env.REPRODUCIBLE_BUILD_SUFFIX ?? `${Date.now()}-${process.pid}`;

function run(command: string, args: string[]): void {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        throw new Error(
            `${command} ${args.join(' ')} exited with ${result.status ?? 'an error'}`,
        );
    }
}

function imageId(tag: string): string {
    const result = spawnSync(
        'docker',
        ['image', 'inspect', tag, '--format', '{{.Id}}'],
        {
            encoding: 'utf8',
        },
    );

    if (result.status !== 0 || !result.stdout.trim()) {
        throw new Error(
            `Could not resolve local image ID for ${tag}: ${result.stderr}`,
        );
    }

    return result.stdout.trim();
}

for (const target of targets) {
    const first = `wikione-repro-${target}:first-${suffix}`;
    const second = `wikione-repro-${target}:second-${suffix}`;

    run('docker', [
        'buildx',
        'bake',
        target,
        '--load',
        // BuildKit provenance statements carry issuance metadata by design.
        // Compare the runtime image itself here; the release workflow emits
        // and signs provenance as a separate supply-chain artifact.
        '--provenance=false',
        '--set',
        `${target}.platform=linux/amd64`,
        '--set',
        `${target}.tags=${first}`,
    ]);
    run('docker', [
        'buildx',
        'bake',
        target,
        '--load',
        '--provenance=false',
        '--set',
        `${target}.platform=linux/amd64`,
        '--set',
        `${target}.tags=${second}`,
    ]);

    const firstId = imageId(first);
    const secondId = imageId(second);
    if (firstId !== secondId) {
        throw new Error(
            `Non-reproducible ${target} image: ${firstId} != ${secondId}`,
        );
    }

    process.stdout.write(`${target}: ${firstId}\n`);
}

process.stdout.write(
    'All OCI image IDs are reproducible for the selected platform.\n',
);
