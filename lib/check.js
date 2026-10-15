const fs = require('node:fs');
const path = require('node:path');
const { ESLint } = require('eslint');
const prettier = require('prettier');

const CONFIG_FILE = path.join(__dirname, '..', 'eslint.config.js');
const PRETTIER_OPTIONS = require('../prettier.json');
const FORMATTED = /\.(ts|tsx|mts|cts|js|cjs|mjs|json|ya?ml)$/;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'build-test', 'coverage', 'docs']);
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

// .uniformignore uses gitignore syntax and applies to both linting and formatting.
function readIgnore(dir) {
  const file = path.join(dir, '.uniformignore');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function walk(dir, root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, root, out);
    } else if (FORMATTED.test(entry.name) && !SKIP_FILES.has(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return out;
}

async function lint(dir, ignorePatterns, fix) {
  const eslint = new ESLint({
    cwd: dir,
    overrideConfigFile: CONFIG_FILE,
    ignorePatterns,
    fix,
    errorOnUnmatchedPattern: false,
  });
  const results = await eslint.lintFiles(['**/*.{ts,tsx,mts,cts,js,cjs,mjs}']);
  if (fix) await ESLint.outputFixes(results);
  const findings = [];
  for (const r of results) {
    for (const m of r.messages) {
      findings.push({
        tool: 'eslint',
        file: path.relative(dir, r.filePath).split(path.sep).join('/'),
        line: m.line ?? 0,
        column: m.column ?? 0,
        rule: m.ruleId ?? 'parse-error',
        message: m.message,
      });
    }
  }
  return findings;
}

async function format(dir, ignorePatterns, fix) {
  const findings = [];
  for (const file of walk(dir, dir)) {
    if (isIgnored(file, ignorePatterns)) continue;
    const full = path.join(dir, file);
    const source = fs.readFileSync(full, 'utf8');
    const options = { ...PRETTIER_OPTIONS, filepath: full };
    let ok;
    try {
      ok = await prettier.check(source, options);
    } catch (e) {
      findings.push({
        tool: 'prettier',
        file,
        line: 0,
        column: 0,
        rule: 'parse-error',
        message: String(e.message).split('\n')[0],
      });
      continue;
    }
    if (ok) continue;
    if (fix) fs.writeFileSync(full, await prettier.format(source, options));
    else
      findings.push({
        tool: 'prettier',
        file,
        line: 0,
        column: 0,
        rule: 'prettier',
        message: 'not formatted (run uniform check --fix)',
      });
  }
  return findings;
}

// Small gitignore subset: "dir/", "name", "*.ext", "a/**/b". ESLint gets the same patterns natively.
function isIgnored(file, patterns) {
  return patterns.some((pattern) => {
    const p = pattern.replace(/^\//, '').replace(/\/$/, '');
    if (!p.includes('*')) return file === p || file.startsWith(p + '/') || file.split('/').includes(p);
    const body = p
      .split('**')
      .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
      .join('.*');
    const re = new RegExp('^' + body + '$');
    return re.test(file) || re.test(file.split('/').pop());
  });
}

async function check(dir, { fix = false } = {}) {
  const root = path.resolve(dir);
  const ignorePatterns = readIgnore(root);
  const findings = [...(await lint(root, ignorePatterns, fix)), ...(await format(root, ignorePatterns, fix))];
  return { status: findings.length ? 'dark' : 'lit', findings };
}

module.exports = { check };
