import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat ESLint for extension + modal sources.
 * Type-aware rules stay light: TS peer range of typescript-eslint lags TS 7.
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'src/modal/dist/**',
      'src/background.bundle.js',
      '**/*.min.js',
      'coverage/**',
      'screenshots/**',
      '.browser/**',
    ],
  },
  js.configs.recommended,
  {
    // Classic scripts + tool configs. TS/TSX checked by `tsc` (typescript-eslint
    // peer range still lags TypeScript 7 in this repo).
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
        chrome: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'prefer-const': 'warn',
    },
  },
];
