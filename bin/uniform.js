#!/usr/bin/env node
const { check } = require('../lib/check');
const { learn } = require('../lib/style-md');

const HELP = `uniform check [dir] [--json] [--fix]
uniform learn [dir] [--json] [--dry-run] [--force]

check  Checks a repo against the house style: ESLint + Prettier with the shared config, or with the
       thresholds in uniform.profile.json when there is one. Ends with "uniform: lit" or "uniform: dark".
       Exit 0 when lit, 1 when dark, 2 on errors.
learn  Reads your own TS/JS (locally, nothing leaves the machine) and writes uniform.profile.json plus a
       first-person STYLE.md. A hand-written STYLE.md is never overwritten (STYLE.learned.md instead,
       unless --force). --dry-run prints the profile without writing.`;

async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  if (args[0] === 'learn' && !flags.has('--help')) return runLearn(args[1] ?? '.', flags);
  if (flags.has('--help') || args[0] !== 'check') {
    process.stdout.write(HELP + '\n');
    return args[0] === undefined || flags.has('--help') ? 0 : 2;
  }
  const result = await check(args[1] ?? '.', { fix: flags.has('--fix') });
  if (flags.has('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    for (const f of result.findings) {
      process.stdout.write(`${f.file}:${f.line}:${f.column}  ${f.rule}  ${f.message}\n`);
    }
    const n = result.findings.length;
    process.stdout.write(n ? `uniform: dark (${n} problem${n === 1 ? '' : 's'})\n` : 'uniform: lit\n');
  }
  return result.status === 'lit' ? 0 : 1;
}

function runLearn(dir, flags) {
  const { profile, style, written } = learn(dir, { write: !flags.has('--dry-run'), force: flags.has('--force') });
  if (flags.has('--json')) process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
  else if (!written.length) process.stdout.write(style);
  for (const file of written) process.stdout.write(`wrote ${file}\n`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => (process.exitCode = code),
  (e) => {
    process.stderr.write(`uniform: ${e.stack ?? e.message}\n`);
    process.exitCode = 2;
  },
);
