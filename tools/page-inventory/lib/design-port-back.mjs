// A design edit reaches this repo as changed CSS. Turning that back into a
// source change means answering two questions: which declarations moved, and
// which Svelte file owns the selector they moved under. The first is a diff of
// two minified stylesheets; the second is the data-src stamp the snapshots
// carry on every element.

const SVELTE_SCOPE_CLASS = /\.(svelte-[a-z0-9]+)\b/g;

// Minified CSS is a flat run of `prelude{body}`. Splitting on brace depth keeps
// at-rule context attached to the rules nested inside it, so the same selector
// under two different media queries stays two entries.
export function splitCssBlocks(css, context = '') {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let preludeEnd = -1;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === '{') {
      if (depth === 0) preludeEnd = index;
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        const prelude = css.slice(start, preludeEnd).trim();
        const body = css.slice(preludeEnd + 1, index);
        if (prelude.startsWith('@') && /[{]/.test(body)) {
          blocks.push(...splitCssBlocks(body, context ? `${context} ${prelude}` : prelude));
        } else if (prelude) {
          blocks.push({ context, selector: prelude, body: body.trim() });
        }
        start = index + 1;
      }
    }
  }
  return blocks;
}

export function parseDeclarations(body) {
  const declarations = new Map();
  let depth = 0;
  let current = '';
  const flush = () => {
    const text = current.trim();
    current = '';
    if (!text) return;
    const separator = text.indexOf(':');
    if (separator === -1) return;
    declarations.set(text.slice(0, separator).trim(), text.slice(separator + 1).trim());
  };
  for (const character of body) {
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    if (character === ';' && depth === 0) flush();
    else current += character;
  }
  flush();
  return declarations;
}

export function indexRules(css) {
  const rules = new Map();
  for (const { context, selector, body } of splitCssBlocks(css)) {
    // Later rules win in the cascade, so a repeated selector keeps the last body.
    rules.set(`${context}||${selector}`, { context, selector, body });
  }
  return rules;
}

export function diffStylesheets(baseline, edited) {
  const before = indexRules(baseline);
  const after = indexRules(edited);
  const changes = [];
  for (const [key, rule] of after) {
    const previous = before.get(key);
    if (previous?.body === rule.body) continue;
    const previousDeclarations = parseDeclarations(previous?.body ?? '');
    const currentDeclarations = parseDeclarations(rule.body);
    const declarations = [];
    for (const [property, value] of currentDeclarations) {
      const was = previousDeclarations.get(property);
      if (was !== value) declarations.push({ property, from: was, to: value });
    }
    for (const [property, value] of previousDeclarations) {
      if (!currentDeclarations.has(property)) {
        declarations.push({ property, from: value, to: undefined });
      }
    }
    if (declarations.length) {
      changes.push({ ...rule, added: !previous, declarations });
    }
  }
  return changes;
}

// Every element in a snapshot carries both its Svelte scope class and the file
// and line that rendered it, which is the only place those two facts meet.
export function indexScopeOwners(snapshotHtml, owners = new Map()) {
  const elements = snapshotHtml.matchAll(/<[a-zA-Z][^>]*>/g);
  for (const [tag] of elements) {
    const source = tag.match(/\sdata-src="([^"]+)"/)?.[1];
    if (!source) continue;
    const classes = tag.match(/\sclass="([^"]*)"/)?.[1] ?? '';
    for (const scope of classes.matchAll(/\b(svelte-[a-z0-9]+)\b/g)) {
      if (!owners.has(scope[1])) owners.set(scope[1], new Set());
      owners.get(scope[1]).add(source);
    }
  }
  return owners;
}

export function selectorOwners(selector, owners) {
  const sources = new Set();
  for (const [, scope] of selector.matchAll(SVELTE_SCOPE_CLASS)) {
    for (const source of owners.get(scope) ?? []) sources.add(source);
  }
  return [...sources].sort();
}

export function describeChange(change, owners) {
  const sources = selectorOwners(change.selector, owners);
  const where = sources.length
    ? sources.join(', ')
    : 'global stylesheet (web/src/app.css or web/src/tokens.css)';
  const context = change.context ? `${change.context} ` : '';
  const lines = [`${context}${change.selector}`, `  ↳ ${where}`];
  for (const { property, from, to } of change.declarations) {
    if (to === undefined) lines.push(`  - ${property}: ${from}`);
    else if (from === undefined) lines.push(`  + ${property}: ${to}`);
    else lines.push(`  ~ ${property}: ${from} → ${to}`);
  }
  return lines.join('\n');
}
