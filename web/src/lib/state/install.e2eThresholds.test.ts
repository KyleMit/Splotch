import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SETTLED_IN_STROKES } from './canvas.svelte';
import { STROKES_BEFORE_AUTO_CLEAR } from './install.svelte';

// The Playwright loader cannot import rune modules, so web/tests/helpers.ts
// retypes both install-banner thresholds as literals. A lowered threshold would
// otherwise leave every install-banner spec green against a stale copy, so the
// helper is read as text and each literal compared with its owner.

// Not inlined: Vite rewrites a literal `new URL('…', import.meta.url)` into a
// served http URL, which readFileSync rejects.
const HELPERS_PATH = '../../../tests/helpers.ts';
const helpersSource = readFileSync(new URL(HELPERS_PATH, import.meta.url), 'utf8');

function helperLiteral(name: string): number | undefined {
  const match = helpersSource.match(new RegExp(`^export const ${name} = (\\d+);`, 'mu'));
  return match ? Number(match[1]) : undefined;
}

it.each([
  ['INSTALL_BANNER_EARNING_STROKES', SETTLED_IN_STROKES],
  ['INSTALL_BANNER_AUTO_CLEAR_STROKES', STROKES_BEFORE_AUTO_CLEAR],
])('keeps the E2E helper %s equal to the app threshold', (name, owner) => {
  expect(helperLiteral(name), `the integer literal ${name} in web/tests/helpers.ts`).toBe(owner);
});
