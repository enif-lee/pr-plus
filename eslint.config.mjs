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
      // Assembled from fragments — lint the assembled file / real modules only
      'src/host/parts/**',
      'src/fetch/parts/**',
      'src/content-bridge/parts/**',
      'src/background/parts/**',
      'src/modal/app/pr-modal/parts/**',
      'src/modal/views/conversation/parts/**',
      'src/modal/styles/parts/**',
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
      'no-control-regex': 'off', // build scripts intentionally strip non-ASCII via \x00-\x7F
      'no-useless-assignment': 'off', // legacy SW/fetch patterns
    },
  },
];
