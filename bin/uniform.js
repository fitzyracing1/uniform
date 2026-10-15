#!/usr/bin/env node
const { check } = require('../lib/check');

const HELP = `uniform check [dir] [--json] [--fix]

Checks a repo against the uniform house style (STYLE.md): ESLint + Prettier with the shared config.
Prints every finding and ends with "uniform: lit" or "uniform: dark". Exit 0 when lit, 1 when dark, 2 on errors.`;

async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
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

main(process.argv.slice(2)).then(
  (code) => (process.exitCode = code),
  (e) => {
    process.stderr.write(`uniform: ${e.stack ?? e.message}\n`);
    process.exitCode = 2;
  },
);
