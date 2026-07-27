import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
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
      'src/modal/views/conversation/ConversationView.tsx',
      'src/modal/styles.css',
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
];
