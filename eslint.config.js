import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'no-const-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-redeclare': 'error',
      'no-undef': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-unreachable': 'warn',
      semi: ['error', 'always'],
      quotes: ['warn', 'single', { avoidEscape: true }],
      'prettier/prettier': 'error',
    },
  },
  prettier,
];
