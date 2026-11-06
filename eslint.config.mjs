import js from '@eslint/js';

export default [
  {
    ignores: [
      '**/node_modules/**',
      'artifacts/**',
      'cache/**',
      'frontend/dist/**',
      'frontend/src/generated/**',
      'runtime/**',
      'tools/**',
    ],
  },
  {
    files: ['**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: {
        AbortSignal: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
];
