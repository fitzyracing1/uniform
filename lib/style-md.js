// Writes the learned profile back out as a STYLE.md in the person's own voice.
const fs = require('node:fs');
const path = require('node:path');
const { MARKER } = require('./learn');
const { buildProfile, collect, PROFILE_FILE } = require('./profile');

const pct = (n) => `${Math.round(n * 100)}%`;

function namingSection(n) {
  const top = Object.entries(n.values.cases)
    .filter(([, share]) => share >= 0.05)
    .map(([c, share]) => `${c === 'lower' ? 'single-word lowercase' : c} ${pct(share)}`)
    .join(', ');
  return `## Naming

Across ${n.values.count} value names I use: ${top}. Types are ${Object.keys(n.types.cases)[0] ?? 'PascalCase'}.
My median name is ${n.values.medianLength} characters, and ${pct(n.values.shortShare)} are one or two letters,
which I keep for tiny scopes (a loop variable, a callback argument).`;
}

function commentSection(c) {
  const jsdoc = c.jsdocBlocks
    ? `I wrote ${c.jsdocBlocks} JSDoc blocks (${c.jsdocPerFunction} per function).`
    : `I don't write JSDoc blocks at all; types are the docs.`;
  return `## Comments

About ${c.perHundredLines} comments per 100 lines. ${pct(c.whyShare)} of them explain *why* (a constraint, a
workaround, "this looks wrong but isn't"), and only ${pct(c.whatShare)} just say *what* the next line does. ${jsdoc}`;
}

function renderStyle(profile) {
  const h = profile.habits;
  const r = profile.rules;
  const f = h.formatting;
  const maxLines = r.eslint['max-lines-per-function'][1].max;
  return `${MARKER}
# How I write code

uniform learned this from ${profile.learnedFrom.files} of my files (${profile.learnedFrom.codeLines} non-blank lines).
\`uniform check\` holds me to it: the numbers below are the thresholds in \`uniform.profile.json\`.

${namingSection(h.naming)}

## Function size

Half my functions are ${h.functions.medianLines} lines or less, 90% fit in ${h.functions.p90Lines}, and the longest
is ${h.functions.maxLines}. The limit is ${maxLines} lines (tests are exempt).

## Nesting

${h.nesting.p90Depth <= 3 ? 'I rarely go deep: ' : ''}90% of blocks sit ${h.nesting.p90Depth} levels in or less. The limit is ${r.eslint['max-depth'][1]}.

${commentSection(h.comments)}

## Formatting

${r.prettier.singleQuote ? 'Single' : 'Double'} quotes (${pct(f.singleQuoteShare)} single), ${r.prettier.semi ? 'semicolons' : 'no semicolons'}
(${pct(f.semicolonShare)} of statements), ${r.prettier.useTabs ? 'tabs' : `${r.prettier.tabWidth}-space indent`}, ${r.prettier.trailingComma === 'all' ? 'trailing commas' : 'no trailing commas'},
${r.prettier.printWidth} columns (95% of my lines are ${f.lineWidthP95} or shorter).

## Imports

${pct(h.imports.esmShare)} ES \`import\`s, ${pct(h.imports.nodePrefixShare)} of built-ins as \`node:\`, ${h.imports.typeOnlyImports} type-only imports.

## Errors

${h.errors.errorClasses} custom error classes, ${h.errors.throws} \`throw\`s, ${h.errors.catches} \`catch\` blocks. ${h.errors.emptyCatches} catches
are empty, and ${h.errors.commentedEmptyCatches} of those say why in a comment.
`;
}

// Never clobber a STYLE.md someone wrote by hand; only one we generated ourselves.
function styleTarget(dir, force) {
  const file = path.join(dir, 'STYLE.md');
  if (force || !fs.existsSync(file) || fs.readFileSync(file, 'utf8').startsWith(MARKER)) return file;
  return path.join(dir, 'STYLE.learned.md');
}

function learn(dir, { write = true, force = false } = {}) {
  const root = path.resolve(dir);
  const profile = buildProfile(collect(root));
  const style = renderStyle(profile);
  const written = [];
  if (write) {
    const profileFile = path.join(root, PROFILE_FILE);
    fs.writeFileSync(profileFile, JSON.stringify(profile, null, 2) + '\n');
    const styleFile = styleTarget(root, force);
    fs.writeFileSync(styleFile, style);
    written.push(profileFile, styleFile);
  }
  return { profile, style, written };
}

module.exports = { renderStyle, learn };
