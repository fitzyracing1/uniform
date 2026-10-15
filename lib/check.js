const fs = require('node:fs');
const path = require('node:path');
const { ESLint } = require('eslint');
const prettier = require('prettier');
const { codeFiles, isIgnored, readIgnore } = require('./files');
const { eslintOverrides, PROFILE_FILE, readProfile } = require('./profile');

const CONFIG_FILE = path.join(__dirname, '..', 'eslint.config.js');
const PRETTIER_OPTIONS = require('../prettier.json');
const FORMATTED = /\.(ts|tsx|mts|cts|js|cjs|mjs|json|ya?ml)$/;

async function lint(dir, ignorePatterns, fix, profile) {
  const eslint = new ESLint({
    cwd: dir,
    overrideConfigFile: CONFIG_FILE,
    ignorePatterns,
    fix,
    errorOnUnmatchedPattern: false,
    overrideConfig: profile ? eslintOverrides(profile) : undefined,
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

async function format(dir, ignorePatterns, fix, profile) {
  const findings = [];
  for (const file of codeFiles(dir).filter((f) => FORMATTED.test(f))) {
    if (isIgnored(file, ignorePatterns)) continue;
    const full = path.join(dir, file);
    const source = fs.readFileSync(full, 'utf8');
    const options = { ...PRETTIER_OPTIONS, ...profile?.prettier, filepath: full };
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

async function check(dir, { fix = false } = {}) {
  const root = path.resolve(dir);
  const ignorePatterns = readIgnore(root);
  // a uniform.profile.json from `uniform learn` replaces the default thresholds
  const profile = readProfile(root);
  const findings = [
    ...(await lint(root, ignorePatterns, fix, profile)),
    ...(await format(root, ignorePatterns, fix, profile)),
  ];
  return { status: findings.length ? 'dark' : 'lit', profile: profile ? PROFILE_FILE : null, findings };
}

module.exports = { check };
