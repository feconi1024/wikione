import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

interface Finding {
    readonly file: string;
    readonly rule: string;
}

const repositoryRoot = resolve(import.meta.dirname, '..');
const roots = ['apps', 'packages'].map((directory) =>
    resolve(repositoryRoot, directory),
);
const rules = [
    {
        name: 'live-mediawiki-edit-adapter',
        pattern: /\baction\s*[:=]\s*['"]edit['"]/u,
    },
    {
        name: 'wikimedia-oauth-token-storage',
        pattern: /\b(?:access_token|refresh_token)\b/u,
    },
    {
        name: 'unsafe-vue-html-insertion',
        pattern: /\bv-html\s*=|\.innerHTML\s*=/u,
    },
    {
        name: 'embedded-private-key',
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
    },
    {
        name: 'embedded-aws-access-key',
        pattern: /\bAKIA[0-9A-Z]{16}\b/u,
    },
    {
        name: 'sensitive-request-logging',
        pattern:
            /request\.log\.(?:info|warn|error|debug)\([^\n]*(?:password|source|cookie|token|summary)/u,
    },
] as const;

const files = (
    await Promise.all(roots.map(async (root) => collectSourceFiles(root)))
).flat();
const findings: Finding[] = [];

for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const rule of rules) {
        if (rule.pattern.test(source)) {
            findings.push({
                file: relative(repositoryRoot, file).replaceAll('\\', '/'),
                rule: rule.name,
            });
        }
    }
}

const report = {
    schemaVersion: 1,
    filesScanned: files.length,
    rules: rules.map((rule) => rule.name),
    findings,
};
process.stdout.write(`${JSON.stringify(report, null, 4)}\n`);
if (findings.length > 0) {
    process.exitCode = 1;
}

async function collectSourceFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (['dist', 'node_modules'].includes(entry.name)) {
                continue;
            }
            files.push(...(await collectSourceFiles(path)));
            continue;
        }
        if (
            ['.ts', '.vue'].includes(extname(entry.name)) &&
            !/\.(?:test|spec)\.ts$/u.test(entry.name)
        ) {
            files.push(path);
        }
    }
    return files;
}
