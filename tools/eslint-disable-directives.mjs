// ESLint plugin: every eslint-disable names the rules it suppresses and says why after ` -- `,
// the standard stylelint.config.js holds `stylelint-disable` to through
// reportDescriptionlessDisables (ADR-0031).
//
// Svelte template comments are covered as well as JS ones. They never reach
// sourceCode.getAllComments(); eslint-plugin-svelte parses them itself as SvelteHTMLComment
// nodes. That parser splits the rule list on whitespace, so a disable written without the ` -- `
// separator does not read as a description — each word of the prose becomes one more rule id
// to suppress.
const DIRECTIVE = /^\s*(eslint-disable(?:-next-line|-line)?)(?=\s|$)(.*)$/su;
const DESCRIPTION_SEPARATOR = /\s-{2,}\s/u;

function parseDisable(text) {
  const match = DIRECTIVE.exec(text);
  if (!match) return null;
  const [ruleList, ...description] = match[2].split(DESCRIPTION_SEPARATOR);
  return {
    kind: match[1],
    namesRules: ruleList.trim().length > 0,
    hasDescription: description.join(' ').trim().length > 0,
  };
}

const requireDisableReason = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require eslint-disable directives to name their rules and give a reason',
    },
    schema: [],
    messages: {
      missingRules: '{{kind}} must name the rules it suppresses.',
      missingDescription: "{{kind}} must say why after ' -- '.",
    },
  },
  create(context) {
    const check = (node, text) => {
      const directive = parseDisable(text);
      if (!directive) return;
      const data = { kind: directive.kind };
      if (!directive.namesRules) context.report({ loc: node.loc, messageId: 'missingRules', data });
      if (!directive.hasDescription) {
        context.report({ loc: node.loc, messageId: 'missingDescription', data });
      }
    };
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) check(comment, comment.value);
      },
      SvelteHTMLComment(node) {
        check(node, node.value);
      },
    };
  },
};

export const disableDirectivesPlugin = {
  rules: { 'require-disable-reason': requireDisableReason },
};
