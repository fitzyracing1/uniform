const fs = require('node:fs');
const path = require('node:path');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'build-test', 'coverage', 'docs']);
// lockfiles and the generated profile aren't anyone's handwriting
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'uniform.profile.json']);

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

function codeFiles(root, dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) codeFiles(root, full, out);
    } else if (!SKIP_FILES.has(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return out;
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

module.exports = { codeFiles, isIgnored, readIgnore };
