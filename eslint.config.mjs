import grafanaI18nPlugin from '@grafana/i18n/eslint-plugin';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import jest from 'eslint-plugin-jest';
import sonarjs from 'eslint-plugin-sonarjs';

import baseConfig from './.config/eslint.config.mjs';

/** @type {Array<import('eslint').Linter.Config>} */
export default [
  {
    ignores: [
      '.config/**',
      '**/.eslintcache',
      'coverage/**',
      'dist/**',
      'e2e/test-reports/**',
      'e2e/test-results/**',
      'node_modules/**',
      'test-results/**',
      'work/**',
      '**/eslint.config.*',
    ],
  },
  ...baseConfig,
  sonarjs.configs.recommended,
  jest.configs['flat/recommended'],
  ...tanstackQuery.configs['flat/recommended'],
  {
    name: 'grafana/i18n-rules',
    ignores: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
    plugins: { '@grafana/i18n': grafanaI18nPlugin },
    rules: {
      '@grafana/i18n/no-untranslated-strings': ['error', { calleesToIgnore: ['^css$', 'use[A-Z].*'] }],
      '@grafana/i18n/no-translation-top-level': 'error',
    },
  },
  {
    rules: {
      'no-console': ['error', { allow: [''] }],
      'no-unused-vars': 'error',
      'react-hooks/rules-of-hooks': 'off',
      'jest/expect-expect': 'error',
      'jest/valid-title': 'off',
      'sonarjs/cognitive-complexity': ['error', 8],
      'sonarjs/prefer-immediate-return': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/public-static-readonly': 'off',
      'sonarjs/prefer-read-only-props': 'off',
      'sonarjs/todo-tag': 'off',
      'sonarjs/fixme-tag': 'off',
      'sonarjs/deprecation': 'off',
      'sonarjs/prefer-regexp-exec': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/different-types-comparison': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-ignored-exceptions': 'off',
      'sonarjs/link-with-target-blank': 'off',
      'sonarjs/no-commented-code': 'off',
      'sonarjs/single-character-alternation': 'off',
      'sonarjs/no-invariant-returns': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      'sonarjs/concise-regex': 'off',
      'sonarjs/no-misleading-array-reverse': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/function-return-type': 'off',
    },
  },
];
