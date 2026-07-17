import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '**/dist/**',
            '**/coverage/**',
            '**/node_modules/**',
            'artifacts/**',
            'eslint.config.js',
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        'eslint.config.js',
                        'vitest.config.ts',
                    ],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },
    prettier,
);
