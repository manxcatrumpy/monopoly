import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  {
    ignores: ['dist/**', 'playwright-report/**', 'test-results/**']
  },
  pluginJs.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Custom globals defined in the project
        $: 'readonly',
        $$: 'readonly',
        t: 'readonly',
        APP_SEMVER: 'readonly',
        APP_BUILD: 'readonly',
        APP_CACHE_SUFFIX: 'readonly',
        importScripts: 'readonly',
        GAME_CONFIG: 'readonly',
        GameRules: 'readonly',
        GameState: 'readonly',
        GameStorage: 'readonly',
        DeckModel: 'readonly',
        ModalManager: 'readonly',
        html2canvas: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_', 'caughtErrorsIgnorePattern': '^_' }],
      'no-undef': 'error',
      'semi': ['warn', 'always'],
      'quotes': ['warn', 'single', { 'avoidEscape': true }],
      'no-empty': ['error', { 'allowEmptyCatch': true }],
      'no-irregular-whitespace': ['error', { 'skipTemplates': true, 'skipStrings': true, 'skipComments': true }]
    }
  },
  {
    files: ['scripts/**', 'tests/**', 'playwright.config.cjs'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['config.js', 'game-rules.js', 'game-state.js', 'storage.js', 'deck-model.js', 'modal-manager.js'],
    languageOptions: { globals: { module: 'readonly', require: 'readonly' } }
  },
  {
    files: ['version.js'],
    rules: { 'no-unused-vars': 'off' }
  }
];
