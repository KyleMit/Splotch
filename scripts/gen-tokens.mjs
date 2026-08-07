// Generates web/src/tokens.css from the design-token source of truth in
// web/src/lib/design/tokens.ts (ADR-0071), plus the per-icon-part spot-icon
// colors in web/src/lib/design/iconTokens.ts (ADR-0101). Run via `npm run gen:tokens`;
// `--check` is the CI drift gate (regenerate and fail if the committed file
// differs, like ruler:check). See the emitted banner in render() below for why
// the dark declarations are emitted twice.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { brand, scale, themes, toCssVarName, zIndex } from '../web/src/lib/design/tokens.ts';
import { iconTokenEntries } from '../web/src/lib/design/iconTokens.ts';
import { ROOT } from './lib/proc.mjs';

const OUT_PATH = resolve(ROOT, 'web/src/tokens.css');

function declarations(tokens, indent) {
  return Object.entries(tokens)
    .map(([key, value]) => `${indent}${toCssVarName(key)}: ${value};`)
    .join('\n');
}

function iconDeclarations(theme, indent) {
  return iconTokenEntries()
    .map(({ cssVar, ...values }) => `${indent}${cssVar}: ${values[theme]};`)
    .join('\n');
}

function render() {
  return `/* GENERATED FILE — do not edit.
   Source: web/src/lib/design/tokens.ts (ADR-0071)
   Regenerate: npm run gen:tokens · CI drift gate: npm run gen:tokens:check

   Dark tokens are applied two ways: an explicit parent choice stamps
   data-theme="dark" on <html>, while the default "system" setting leaves the
   attribute off and lets prefers-color-scheme decide (data-theme="light" opts
   out of it). CSS has no way to share a declaration block between an
   attribute selector and a media query at our browser floor (light-dark()
   needs Chrome 123 / Safari 17.5), so the generator emits the dark block
   twice — that's what guarantees the two forms can never drift. */

:root {
  color-scheme: light;

${declarations(brand, '  ')}

${declarations(scale, '  ')}

${declarations(zIndex, '  ')}

${declarations(themes.light, '  ')}

${iconDeclarations('light', '  ')}
}

:root[data-theme='dark'] {
  color-scheme: dark;
${declarations(themes.dark, '  ')}

${iconDeclarations('dark', '  ')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${declarations(themes.dark, '    ')}

${iconDeclarations('dark', '    ')}
  }
}
`;
}

function safeRead(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

const {
  values: { check },
} = parseArgs({ options: { check: { type: 'boolean' } } });
const next = render();
const current = safeRead(OUT_PATH);

if (check) {
  if (current !== next) {
    console.error('tokens.css is out of date — run `npm run gen:tokens` and commit the result.');
    process.exit(1);
  }
  console.log('tokens.css is up to date.');
} else if (current === next) {
  console.log('tokens.css already up to date.');
} else {
  writeFileSync(OUT_PATH, next);
  console.log('Wrote web/src/tokens.css');
}
