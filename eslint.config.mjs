import js from '@eslint/js';
import globals from 'globals';
import tsStripParser from './scripts/eslint-ts-strip-parser.mjs';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.tmp-*/**',
      '.tmp-*/**',
      '.tmp-*',
      'src/modal/dist/**',
      'src/background.bundle.js',
      'src/host/parts/**',
      'src/fetch/parts/**',
      'src/content-bridge/parts/**',
      'src/background/parts/**',
      'src/modal/app/pr-modal/parts/**',
      'src/modal/views/conversation/parts/**',
      'src/modal/styles/parts/**',
      'src/pr-modal-host.js',
      'src/fetch-pulls.js',
      'src/content-bridge.js',
      'src/background.js',
      'src/modal/app/PrModalApp.tsx',
      'src/modal/app/PrModalApp.generated.tsx',
      'src/modal/styles.css',
      // Generated pure IIFEs (SoT is src/modal/lib/*.ts)
      'src/modal/pure/**',
      // Content-script / entry JS emitted from TypeScript SoT
      'src/tree.js',
      'src/dom.js',
      'src/content.js',
      'src/content-bootstrap.js',
      'src/pr-list-focus.js',
      'src/pulls-palette.js',
      'src/popup.js',
      'src/storage.js',
      'src/github-endpoints.js',
      'tests/**',
      'screenshots/**',
      '.browser/**',
      '**/*.min.js',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  {
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-control-regex': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    files: [
      'src/host/modules/**/*.ts',
      'src/modal/views/conversation/ConversationView.tsx',
    ],
    languageOptions: {
      parser: tsStripParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
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
      'no-control-regex': 'off',
      'no-useless-assignment': 'off',
      'no-extra-boolean-cast': 'off',
    },
  },
];
