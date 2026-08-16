import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKS_TWO_COL_CSS } from '../lib/books-grid-override.mjs';

// Drift guard for the books-scene capture override: it re-states the custom
// properties of ColoringBook.svelte's tall-portrait two-column rule (the
// override exists because that rule is gated on min-width: 741px, which the
// 576px capture viewport can never reach, and a Svelte <style> block cannot
// be imported). If the component's declarations change, this fails instead of
// letting the store generator silently render stale UI.

const componentSource = readFileSync(
  join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'web',
    'src',
    'lib',
    'components',
    'ColoringBook.svelte'
  ),
  'utf8'
);

const TALL_PORTRAIT_GATE = '@media (max-aspect-ratio: 4 / 5) and (min-width: 741px)';

// The properties the override copies. The override's modal width rule is its
// own addition (the dialog otherwise stays 90% of the capture viewport) and
// deliberately not compared.
const COPIED_PROPERTIES = [
  '--book-cols',
  '--book-grid-rows-in-view',
  '--book-grid-chrome',
  '--book-grid-max-width',
];

// Balanced-brace slice of the media block's body, so a later rule added after
// it can't leak into the comparison.
function tallPortraitBlock(source) {
  const gate = source.indexOf(TALL_PORTRAIT_GATE);
  expect(gate, `component still declares "${TALL_PORTRAIT_GATE}"`).toBeGreaterThan(-1);
  const open = source.indexOf('{', gate);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(open, i + 1);
  }
  throw new Error('unbalanced tall-portrait media block');
}

// A declaration's value with whitespace collapsed and the override's
// !important stripped, so formatting differences don't count as drift.
function declarationValue(css, property) {
  const match = css.match(new RegExp(`${property}\\s*:\\s*([^;]+);`));
  expect(match, `${property} is declared`).not.toBeNull();
  return match[1]
    .replace(/!important/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('books two-column capture override', () => {
  const componentBlock = tallPortraitBlock(componentSource);

  it.each(COPIED_PROPERTIES)('matches the component for %s', (property) => {
    expect(declarationValue(BOOKS_TWO_COL_CSS, property)).toBe(
      declarationValue(componentBlock, property)
    );
  });

  it('covers every custom property the component block declares', () => {
    const declared = [...componentBlock.matchAll(/--[\w-]+(?=\s*:)/g)].map(([name]) => name);
    expect(new Set(declared)).toEqual(new Set(COPIED_PROPERTIES));
  });
});
