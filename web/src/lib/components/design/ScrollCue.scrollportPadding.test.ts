// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ScrollCue's sticky fade spends `--scrollport-bottom-padding` as a negative
// inset to reach the edge its scrollport clips at, and nothing measures that
// padding: the scroller that hosts a bare `<ScrollCue />` declares the property
// beside its own `padding-bottom`. Two declarations in one rule agree only while
// someone keeps them agreeing, so this reads every hosting component back off
// disk and holds them equal in every rule — media-query arms included — that
// pads the scroller. A rule may also spend the property as its bottom padding
// outright, which is the one form that cannot drift.

const SCROLLPORT_BOTTOM_PADDING_PROPERTY = '--scrollport-bottom-padding';

/** A bare ScrollCue plants its own sticky fade inside the scroller; the wrapper
 *  form (`<ScrollCue>…</ScrollCue>`) paints beside it and needs no padding. */
const BARE_SCROLL_CUE = /<ScrollCue\b[^>]*\/>/;

/** The scrollers this guard is known to check, so a parser that silently stops
 *  matching reads as a failure instead of a clean pass. */
const KNOWN_SCROLLERS = [
  ['lib/components/ColoringBook.svelte', '.coloring-book-modal'],
  ['lib/components/settings/CompactShell.svelte', '.quick-toggles-scroll'],
  ['lib/components/styleguide/PrimitiveSections.svelte', '.cue-scroller'],
];

const SRC_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function svelteFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svelteFilesUnder(path);
    return entry.name.endsWith('.svelte') ? [path] : [];
  });
}

interface Rule {
  selector: string;
  context: string[];
  declarations: Map<string, string>;
}

function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && (depth -= 1) === 0) return i;
  }
  throw new Error('unbalanced braces');
}

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const statement of body.split(';')) {
    const colon = statement.indexOf(':');
    if (colon === -1) continue;
    declarations.set(statement.slice(0, colon).trim(), statement.slice(colon + 1).trim());
  }
  return declarations;
}

function parseRules(css: string, context: string[] = []): Rule[] {
  const rules: Rule[] = [];
  for (let i = 0; ;) {
    const open = css.indexOf('{', i);
    if (open === -1) return rules;
    const header = css.slice(i, open).trim();
    const close = closingBrace(css, open);
    const body = css.slice(open + 1, close);
    if (header.startsWith('@')) rules.push(...parseRules(body, [...context, header]));
    else rules.push({ selector: header, context, declarations: parseDeclarations(body) });
    i = close + 1;
  }
}

function styleRules(source: string): Rule[] {
  const match = source.match(/<style>([\s\S]*)<\/style>/);
  if (!match) return [];
  return parseRules(match[1].replace(/\/\*[\s\S]*?\*\//g, ''));
}

function establishesScrollport(declarations: Map<string, string>): boolean {
  const overflow = declarations.get('overflow-y') ?? declarations.get('overflow') ?? '';
  return /\b(?:auto|scroll)\b/.test(overflow);
}

/** Top-level terms of a shorthand value: whitespace inside `var()`/`calc()`
 *  does not separate terms. */
function shorthandTerms(value: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (/\s/.test(char) && depth === 0) {
      if (current) terms.push(current);
      current = '';
    } else current += char;
  }
  if (current) terms.push(current);
  return terms;
}

function bottomPadding(declarations: Map<string, string>): string | undefined {
  const longhand = declarations.get('padding-bottom');
  if (longhand !== undefined) return longhand;
  const shorthand = declarations.get('padding');
  if (shorthand === undefined) return undefined;
  const terms = shorthandTerms(shorthand);
  // `padding: a` / `a b` / `a b c` / `a b c d`: bottom is a, a, c, c.
  return terms.length < 3 ? terms[0] : terms[2];
}

/** `0` and `0px` are the same length. */
function normalizeLength(value: string): string {
  return value === '0' ? '0px' : value;
}

function label(rule: Rule): string {
  return [...rule.context, rule.selector].join(' > ');
}

describe('every scroller hosting a bare ScrollCue declares the padding its fade reaches past', () => {
  const hosts = svelteFilesUnder(SRC_ROOT).filter((path) =>
    BARE_SCROLL_CUE.test(readFileSync(path, 'utf8').replace(/<style>[\s\S]*<\/style>/, ''))
  );
  const checked: string[][] = [];

  for (const path of hosts) {
    const file = relative(SRC_ROOT, path);
    const rules = styleRules(readFileSync(path, 'utf8'));
    const scrollers = new Set(
      rules.filter((rule) => establishesScrollport(rule.declarations)).map((rule) => rule.selector)
    );

    for (const selector of scrollers) {
      checked.push([file, selector]);
      const own = rules.filter((rule) => rule.selector === selector);

      it(`${file}: \`${selector}\` declares ${SCROLLPORT_BOTTOM_PADDING_PROPERTY}`, () => {
        expect(own.some((rule) => rule.declarations.has(SCROLLPORT_BOTTOM_PADDING_PROPERTY))).toBe(
          true
        );
      });

      for (const rule of own) {
        const bottom = bottomPadding(rule.declarations);
        if (bottom === undefined) continue;
        it(`${file}: \`${label(rule)}\` pads its bottom by the property it declares`, () => {
          const declared = rule.declarations.get(SCROLLPORT_BOTTOM_PADDING_PROPERTY);
          expect(declared, 'a rule that pads the scroller redeclares the property').toBeDefined();
          if (bottom === `var(${SCROLLPORT_BOTTOM_PADDING_PROPERTY})`) return;
          expect(normalizeLength(bottom)).toBe(normalizeLength(declared!));
        });
      }
    }
  }

  it('reaches the scrollers it exists for', () => {
    expect(checked).toEqual(expect.arrayContaining(KNOWN_SCROLLERS));
  });
});
