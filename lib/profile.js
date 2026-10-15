// Turns raw habit counts into a profile (thresholds + formatter settings) and a first-person STYLE.md.
const fs = require('node:fs');
const path = require('node:path');
const { collect, namingSummary, percentile, ratio, MARKER } = require('./learn');

const PROFILE_FILE = 'uniform.profile.json';
const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];
const CODE_FILES = ['**/*.{ts,tsx,mts,cts,js,cjs,mjs}'];
const TEST_FILES = ['**/{test,tests}/**/*.{ts,tsx,mts,cts,js,cjs,mjs}', '**/*.{test,spec}.{ts,tsx,mts,cts,js,cjs,mjs}'];
const FORMATS = ['camelCase', 'PascalCase', 'UPPER_CASE', 'snake_case'];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
// people pick round widths; Prettier can't wrap long strings or regexes, so a few lines always poke out
const WIDTHS = [80, 100, 120, 140, 160];
const roundUp = (n, step) => Math.ceil(n / step) * step;

// formats someone actually uses (5%+ of names). all-lowercase names fit camelCase and snake_case alike.
function formatsUsed(cases, fallback) {
  const used = FORMATS.filter((f) => (cases[f] ?? 0) >= 0.05);
  return used.length ? used : [fallback];
}

function habitsFrom(stats) {
  const fnLines = stats.functionLines;
  const c = stats.comments;
  const explained = c.why + c.what + c.other;
  return {
    naming: { values: namingSummary(stats.names.value), types: namingSummary(stats.names.type) },
    functions: {
      count: fnLines.length,
      medianLines: percentile(fnLines, 50),
      p90Lines: percentile(fnLines, 90),
      maxLines: Math.max(0, ...fnLines),
    },
    nesting: { p90Depth: percentile(stats.depths, 90), maxDepth: Math.max(0, ...stats.depths) },
    comments: {
      perHundredLines: Math.round((explained / Math.max(1, stats.codeLines)) * 1000) / 10,
      whyShare: ratio(c.why, explained),
      whatShare: ratio(c.what, explained),
      jsdocBlocks: c.jsdoc,
      jsdocPerFunction: ratio(c.jsdoc, fnLines.length),
    },
    formatting: {
      singleQuoteShare: ratio(stats.quotes.single, stats.quotes.single + stats.quotes.double),
      semicolonShare: ratio(stats.semis.with, stats.semis.with + stats.semis.without),
      indent:
        stats.indents.tab > stats.indents.two + stats.indents.four
          ? 'tab'
          : stats.indents.four > stats.indents.two
            ? 4
            : 2,
      lineWidthP95: percentile(stats.lineWidths, 95),
      lineWidthP98: percentile(stats.lineWidths, 98),
      trailingCommaShare: ratio(stats.trailingCommas.with, stats.trailingCommas.with + stats.trailingCommas.without),
    },
    imports: {
      esmShare: ratio(stats.imports.esm, stats.imports.esm + stats.imports.require),
      nodePrefixShare: ratio(stats.imports.nodePrefixed, stats.imports.nodePrefixed + stats.imports.nodeBare),
      typeOnlyImports: stats.imports.typeOnly,
    },
    errors: { ...stats.errors },
  };
}

function rulesFrom(h) {
  const values = formatsUsed(h.naming.values.cases, 'camelCase');
  const types = formatsUsed(h.naming.types.cases, 'PascalCase');
  return {
    prettier: {
      singleQuote: h.formatting.singleQuoteShare >= 0.5,
      semi: h.formatting.semicolonShare >= 0.5,
      useTabs: h.formatting.indent === 'tab',
      tabWidth: h.formatting.indent === 4 ? 4 : 2,
      printWidth: WIDTHS.find((w) => w >= h.formatting.lineWidthP98) ?? 160,
      trailingComma: h.formatting.trailingCommaShare >= 0.5 ? 'all' : 'none',
    },
    eslint: {
      'max-lines-per-function': [
        'error',
        { max: clamp(roundUp(h.functions.maxLines, 10), 40, 150), skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['error', clamp(h.nesting.maxDepth, 3, 6)],
      'uniform/no-jsdoc': h.comments.jsdocPerFunction < 0.1 ? 'error' : 'off',
      'no-restricted-imports': h.imports.nodePrefixShare >= 0.5 ? 'keep' : 'off',
    },
    eslintTs: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: values, leadingUnderscore: 'allow' },
        { selector: 'variable', modifiers: ['const'], format: [...new Set([...values, 'UPPER_CASE'])] },
        { selector: 'typeLike', format: types },
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
        { selector: 'import', format: null },
      ],
      '@typescript-eslint/consistent-type-imports':
        h.imports.typeOnlyImports > 0 ? ['error', { fixStyle: 'inline-type-imports' }] : 'off',
    },
  };
}

function buildProfile(stats) {
  const habits = habitsFrom(stats);
  return {
    uniformProfile: 1,
    learnedFrom: { files: stats.files, codeLines: stats.codeLines },
    habits,
    rules: rulesFrom(habits),
  };
}

const ALLOWED = {
  prettier: ['singleQuote', 'semi', 'useTabs', 'tabWidth', 'printWidth', 'trailingComma'],
  eslint: ['max-lines-per-function', 'max-depth', 'uniform/no-jsdoc', 'no-restricted-imports'],
  eslintTs: ['@typescript-eslint/naming-convention', '@typescript-eslint/consistent-type-imports'],
};

// The profile file may come from a stranger's repo (the hosted service), so only the settings
// `learn` itself writes get through. Anything else is dropped, never passed on to ESLint.
function readProfile(dir) {
  const file = path.join(dir, PROFILE_FILE);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keep = (section) =>
    Object.fromEntries(Object.entries(raw?.rules?.[section] ?? {}).filter(([k]) => ALLOWED[section].includes(k)));
  return { prettier: keep('prettier'), eslint: keep('eslint'), eslintTs: keep('eslintTs') };
}

// ESLint overrides for `uniform check`. "keep" means: leave the default rule as it is.
function eslintOverrides(profile) {
  const pick = (rules) => Object.fromEntries(Object.entries(rules).filter(([, v]) => v !== 'keep'));
  return [
    { files: CODE_FILES, rules: pick(profile.eslint) },
    { files: TS_FILES, rules: pick(profile.eslintTs) },
    // tests keep their usual leeway even with a profile
    { files: TEST_FILES, rules: { 'max-lines-per-function': 'off', '@typescript-eslint/no-explicit-any': 'off' } },
  ];
}

module.exports = { buildProfile, readProfile, eslintOverrides, PROFILE_FILE, collect, MARKER };
