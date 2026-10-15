const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { check } = require('../lib/check');
const { badge } = require('../service/server');

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uniform-test-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

test('clean code is lit', async () => {
  const dir = project({ 'src/add.ts': 'export function add(a: number, b: number): number {\n  return a + b;\n}\n' });
  assert.deepEqual(await check(dir), { status: 'lit', findings: [] });
});

test('boilerplate JSDoc, any, bad names and formatting go dark', async () => {
  const dir = project({
    'src/bad.ts': '/** Adds. */\nexport function Add_Numbers(a: any, b: number) { return a+b }\n',
  });
  const { status, findings } = await check(dir);
  assert.equal(status, 'dark');
  const rules = new Set(findings.map((f) => f.rule));
  for (const r of [
    'uniform/no-jsdoc',
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/naming-convention',
    'prettier',
  ]) {
    assert.ok(rules.has(r), `expected ${r}`);
  }
});

test('.uniformignore skips files for both tools', async () => {
  const dir = project({ '.uniformignore': 'gen/\n', 'gen/x.ts': 'var  x:any=1' });
  assert.equal((await check(dir)).status, 'lit');
});

test('--fix makes formatting lit', async () => {
  const dir = project({ 'a.ts': 'export const a = {b:1}\n' });
  await check(dir, { fix: true });
  assert.equal((await check(dir)).status, 'lit');
});

test('badge says lit or dark', () => {
  assert.match(badge('lit'), /uniform: lit/);
  assert.match(badge('dark'), /uniform: dark/);
});

test('json files named like tests are not linted as code', async () => {
  const dir = project({ 'tsconfig.test.json': '{ "extends": "./tsconfig.json" }\n' });
  assert.equal((await check(dir)).status, 'lit');
});
