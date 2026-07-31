import { spawnSync } from 'node:child_process';

const imageNames = {
    api: process.env.API_IMAGE ?? 'wikione-api:smoke',
    preview: process.env.PREVIEW_IMAGE ?? 'wikione-preview:smoke',
    web: process.env.WEB_IMAGE ?? 'wikione-web:smoke',
};

function inspect(image: string, template: string): string {
    const result = spawnSync(
        'docker',
        ['image', 'inspect', image, '--format', template],
        {
            encoding: 'utf8',
        },
    );

    if (result.status !== 0) {
        throw new Error(`Could not inspect ${image}: ${result.stderr}`);
    }

    return result.stdout.trim();
}

for (const [service, image] of Object.entries(imageNames)) {
    const user = inspect(image, '{{.Config.User}}');
    const healthcheck = inspect(image, '{{json .Config.Healthcheck}}');
    const license = inspect(
        image,
        '{{ index .Config.Labels "org.opencontainers.image.licenses" }}',
    );

    if (!user || user === 'root' || user === '0') {
        throw new Error(`${service} image must declare a non-root user`);
    }
    if (!healthcheck || healthcheck === 'null') {
        throw new Error(`${service} image must declare a HEALTHCHECK`);
    }
    if (license !== 'MIT') {
        throw new Error(`${service} image must declare its SPDX license label`);
    }
}

const web = spawnSync(
    'docker',
    [
        'run',
        '--rm',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--tmpfs',
        '/etc/nginx/conf.d:uid=101,gid=101,mode=0755',
        '-e',
        'API_ORIGIN=https://api.smoke.test',
        '-e',
        'PREVIEW_ORIGIN=https://preview.smoke.test',
        imageNames.web,
        'nginx',
        '-t',
    ],
    { encoding: 'utf8', timeout: 15_000 },
);

if (web.status !== 0) {
    throw new Error(`Read-only web configuration check failed: ${web.stderr}`);
}

const runtimeConfig = spawnSync(
    'docker',
    [
        'run',
        '--rm',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--entrypoint',
        '/bin/sh',
        '-e',
        'API_ORIGIN=https://api.smoke.test',
        '-e',
        'PREVIEW_ORIGIN=https://preview.smoke.test',
        imageNames.web,
        '-c',
        '/docker-entrypoint.d/20-wikione-runtime-config.sh && grep -F \'apiBaseUrl:"https://api.smoke.test"\' /tmp/wikione-runtime-config.js',
    ],
    { encoding: 'utf8', timeout: 15_000 },
);

if (runtimeConfig.status !== 0) {
    throw new Error(
        `Web runtime-origin generation failed: ${runtimeConfig.stderr}`,
    );
}

const localRuntimeConfig = spawnSync(
    'docker',
    [
        'run',
        '--rm',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--entrypoint',
        '/bin/sh',
        '-e',
        'ALLOW_INSECURE_LOOPBACK_ORIGINS=true',
        '-e',
        'API_ORIGIN=http://127.0.0.1:3000',
        '-e',
        'PREVIEW_ORIGIN=http://localhost:4174',
        imageNames.web,
        '-c',
        '/docker-entrypoint.d/20-wikione-runtime-config.sh && grep -F \'apiBaseUrl:"http://127.0.0.1:3000"\' /tmp/wikione-runtime-config.js',
    ],
    { encoding: 'utf8', timeout: 15_000 },
);

if (localRuntimeConfig.status !== 0) {
    throw new Error(
        `Opted-in loopback runtime configuration failed: ${localRuntimeConfig.stderr}`,
    );
}

const insecureRuntimeConfig = spawnSync(
    'docker',
    [
        'run',
        '--rm',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--entrypoint',
        '/docker-entrypoint.d/20-wikione-runtime-config.sh',
        '-e',
        'API_ORIGIN=http://127.0.0.1:3000',
        '-e',
        'PREVIEW_ORIGIN=https://preview.smoke.test',
        imageNames.web,
    ],
    { encoding: 'utf8', timeout: 15_000 },
);

if (insecureRuntimeConfig.status === 0) {
    throw new Error('Web runtime configuration accepted HTTP without opt-in');
}

const unsafeRuntimeConfig = spawnSync(
    'docker',
    [
        'run',
        '--rm',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--entrypoint',
        '/docker-entrypoint.d/20-wikione-runtime-config.sh',
        '-e',
        'API_ORIGIN=https://api.smoke.test/unsafe',
        '-e',
        'PREVIEW_ORIGIN=https://preview.smoke.test',
        imageNames.web,
    ],
    { encoding: 'utf8', timeout: 15_000 },
);

if (unsafeRuntimeConfig.status === 0) {
    throw new Error('Web runtime configuration accepted an unsafe API origin');
}

process.stdout.write(
    'OCI labels, non-root users, health checks, and read-only runtime configuration passed.\n',
);
