// Generates web/src/tokens.css from the design-token source of truth in
// web/src/lib/design/tokens.ts (ADR-0071). Run via `npm run gen:tokens`;
// `--check` is the CI drift gate (regenerate and fail if the committed file
// differs, like ruler:check).
//
// The dark declarations are emitted twice — under :root[data-theme='dark']
// and under the prefers-color-scheme media query — because CSS has no way to
// share a declaration block between an attribute selector and a media query
// at our browser floor (light-dark() needs Chrome 123 / Safari 17.5). The
// generator is what guarantees the two blocks stay identical.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brand, scale, themes, toCssVarName } from '../web/src/lib/design/tokens.ts';
import { ROOT } from './lib/utils.mjs';

const OUT_PATH = resolve(ROOT, 'web/src/tokens.css');

function declarations(tokens, indent) {
  return Object.entries(tokens)
    .map(([key, value]) => `${indent}${toCssVarName(key)}: ${value};`)
    .join('\n');
}

function render() {
  const darkBody = declarations(themes.dark, '  ');
  return `/* GENERATED FILE — do not edit.
   Source: web/src/lib/design/tokens.ts (ADR-0071)
   Regenerate: npm run gen:tokens · CI drift gate: npm run gen:tokens:check

   Dark tokens are applied two ways: an explicit parent choice stamps
   data-theme="dark" on <html>, while the default "system" setting leaves the
   attribute off and lets prefers-color-scheme decide (data-theme="light" opts
   out of it). The generator emits the dark block twice so the two forms can
   never drift. */

:root {
  color-scheme: light;

${declarations(brand, '  ')}

${declarations(scale, '  ')}

${declarations(themes.light, '  ')}
}

:root[data-theme='dark'] {
  color-scheme: dark;
${darkBody}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${declarations(themes.dark, '    ')}
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

const check = process.argv.includes('--check');
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
