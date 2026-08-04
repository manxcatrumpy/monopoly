import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
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
        t: 'readonly'
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
  }
];
