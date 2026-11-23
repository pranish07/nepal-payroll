import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'data/**',
      'samples/**',
      'package-lock.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'round',
          message: 'Money must be rounded with mulDivRound(), never Math.round().',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='toFixed']",
          message: 'Do not format money with toFixed(); use formatNprPaisa().',
        },
      ],
    },
  },
  {
    // Defense in depth: employee-facing payslip code may not import admin-only modules.
    files: ['apps/api/src/routes/payslips.ts', 'apps/api/src/payslip/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/repositories/admin*', '**/services/admin*'],
              message: 'Employee-facing payslip code must not import admin-only modules.',
            },
          ],
        },
      ],
    },
  },
);
