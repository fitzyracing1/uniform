const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { check } = require('../lib/check');
const { caseOf, classifyComment, MARKER } = require('../lib/learn');
const { learn } = require('../lib/style-md');

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uniform-learn-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

// someone who writes double quotes, no semicolons, 4-space indent, snake_case and no trailing commas
const theirs = `import * as fs from "node:fs"

export class ParseError extends Error {}

// keep the raw text too, because callers re-print it
export function read_config(file_path: string) {
    try {
        return JSON.parse(fs.readFileSync(file_path, "utf8"))
    } catch {
        // a missing file is normal here
    }
    const default_value = {
        name: "x",
        size: 1
    }
    return default_value
}
`;

test('learns quotes, semicolons, indent, naming, comments and errors', () => {
  const { profile } = learn(project({ 'src/a.ts': theirs }), { write: false });
  const { habits, rules } = profile;
  assert.equal(rules.prettier.singleQuote, false);
  assert.equal(rules.prettier.semi, false);
  assert.equal(rules.prettier.tabWidth, 4);
  assert.equal(rules.prettier.trailingComma, 'none');
  assert.ok(habits.naming.values.cases.snake_case > 0.5);
  assert.ok(rules.eslintTs['@typescript-eslint/naming-convention'][1].format.includes('snake_case'));
  assert.equal(habits.comments.jsdocBlocks, 0);
  assert.equal(rules.eslint['uniform/no-jsdoc'], 'error');
  assert.equal(habits.comments.whyShare, 1);
  assert.equal(habits.errors.errorClasses, 1);
  assert.equal(habits.errors.commentedEmptyCatches, 1);
  assert.equal(habits.imports.nodePrefixShare, 1);
});

test('function length and nesting drive the thresholds; tests are left out', () => {
  const long = `export function big() {\n${'  let a = 1;\n'.repeat(70)}}\n`;
  const deep =
    'export function d(x: number) {\n  if (x) {\n    for (;;) {\n      while (x) {\n        if (x) {\n          return 1;\n        } else if (x > 1) {\n          return 2;\n        }\n      }\n    }\n  }\n}\n';
  const { profile } = learn(
    project({ 'a.ts': long + deep, 'test/x.test.ts': `test('t', () => {\n${'  x();\n'.repeat(300)}});\n` }),
    { write: false },
  );
  assert.equal(profile.habits.functions.maxLines, 72);
  assert.equal(profile.rules.eslint['max-lines-per-function'][1].max, 80);
  // else-if is not one more level, same as ESLint's max-depth
  assert.equal(profile.habits.nesting.maxDepth, 4);
});

test('writes uniform.profile.json and a first-person STYLE.md, and check then uses it', async () => {
  const dir = project({ 'src/a.ts': theirs });
  const before = await check(dir);
  assert.equal(before.status, 'dark', 'the default style wants single quotes and semicolons');
  const { written, style } = learn(dir);
  assert.deepEqual(
    written.map((f) => path.basename(f)),
    ['uniform.profile.json', 'STYLE.md'],
  );
  assert.ok(style.startsWith(MARKER));
  assert.match(style, /# How I write code/);
  assert.match(style, /Double quotes/);
  const after = await check(dir);
  assert.equal(after.profile, 'uniform.profile.json');
  assert.deepEqual(after.findings, []);
  assert.equal(after.status, 'lit');
});

test('a hand-written STYLE.md is never overwritten', () => {
  const dir = project({ 'a.ts': 'export const a = 1;\n', 'STYLE.md': '# mine\n' });
  const { written } = learn(dir);
  assert.equal(fs.readFileSync(path.join(dir, 'STYLE.md'), 'utf8'), '# mine\n');
  assert.equal(path.basename(written[1]), 'STYLE.learned.md');
  learn(dir, { force: true });
  assert.ok(fs.readFileSync(path.join(dir, 'STYLE.md'), 'utf8').startsWith(MARKER));
});

test('a profile cannot smuggle in other ESLint rules', async () => {
  const profile = {
    rules: { eslint: { 'no-console': 'error', 'max-depth': ['error', 1] }, prettier: { plugins: ['evil'] } },
  };
  const dir = project({ 'uniform.profile.json': JSON.stringify(profile), 'a.js': "console.log('hi');\n" });
  const result = await check(dir);
  assert.equal(result.status, 'lit');
});

test('naming and comment classifiers', () => {
  assert.equal(caseOf('readConfig'), 'camelCase');
  assert.equal(caseOf('read_config'), 'snake_case');
  assert.equal(caseOf('MAX_SIZE'), 'UPPER_CASE');
  assert.equal(caseOf('Scan'), 'PascalCase');
  assert.equal(classifyComment('increment the counter'), 'what');
  assert.equal(classifyComment('git for windows hands us CRLF, so split on both'), 'why');
});
