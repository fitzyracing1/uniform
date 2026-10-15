// The shared ESLint flat config. STYLE.md explains each rule; this file enforces what a machine can check.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
const noJsdoc = require('./lib/no-jsdoc');

const BUILTINS = ['fs', 'path', 'os', 'child_process', 'readline', 'util', 'crypto', 'url', 'http', 'https', 'zlib'];

const ignores = ['**/node_modules/', '**/dist/', '**/build/', '**/build-test/', '**/coverage/', '**/docs/'];

const shared = {
  'no-duplicate-imports': 'error',
  'no-restricted-imports': ['error', { paths: BUILTINS.map((name) => ({ name, message: `use 'node:${name}'` })) }],
  'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
  'max-depth': ['error', 5],
  'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx'] }],
  eqeqeq: ['error', 'always'],
  'prefer-const': 'error',
  'no-var': 'error',
  'object-shorthand': 'error',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'uniform/no-jsdoc': 'error',
};

module.exports = tseslint.config(
  { ignores },
  { plugins: { uniform: { rules: { 'no-jsdoc': noJsdoc } } } },
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: shared,
  },
  {
    files: ['**/*.cjs', '**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.{ts,tsx,mts,cts}'] })),
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      ...shared,
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'variable', modifiers: ['const'], format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        // object keys mirror external formats (SARIF, hook JSON, CLI flags), leave them alone
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
        { selector: 'import', format: null },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // tests feed deliberately wrong values into typed APIs, and long describe() blocks are fine
    files: ['**/{test,tests}/**/*.{ts,tsx,mts,cts,js,cjs,mjs}', '**/*.{test,spec}.{ts,tsx,mts,cts,js,cjs,mjs}'],
    rules: { 'max-lines-per-function': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
);
module.exports.ignores = ignores;
