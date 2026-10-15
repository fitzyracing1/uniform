// STYLE.md rule 3. Types already document the signature, so /** */ blocks are almost always noise.
// Licence headers and @ts/eslint pragmas are plain /* */ or // comments, so they don't trip this.
module.exports = {
  meta: {
    type: 'suggestion',
    docs: { description: 'disallow JSDoc-style /** */ comment blocks' },
    schema: [],
    messages: { jsdoc: 'No boilerplate JSDoc: delete it, or keep a one-line // comment that explains why.' },
  },
  create(context) {
    return {
      Program() {
        for (const c of context.sourceCode.getAllComments()) {
          if (c.type === 'Block' && c.value.startsWith('*') && c.value !== '*') {
            context.report({ loc: c.loc, messageId: 'jsdoc' });
          }
        }
      },
    };
  },
};
