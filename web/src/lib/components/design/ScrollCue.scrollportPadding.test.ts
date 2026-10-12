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

/** The cue sticks to the document's own scroller, which pads nothing, so the
 *  `0px` fallback in ScrollCue.svelte is the declaration. */
const DOCUMENT_SCROLLER = 'document';

/** Every component that renders a bare ScrollCue, with the scrollers its cue can
 *  stick to: the selectors of the rules in its own `<style>` block that
 *  establish a scrollport, or the document. The discovered hosts and their
 *  scrollers must match this exactly, so a new call site fails until it is
 *  classified here — either by declaring the property on a scroller rule of its
 *  own (a scrollport padded only by a global class, like the coloring picker's
 *  `.modal-shell`, still needs the local declaration) or by naming the document. */
const HOSTS: Record<string, readonly string[] | typeof DOCUMENT_SCROLLER> = {
  'lib/components/ColoringBook.svelte': ['.coloring-book-modal'],
  'lib/components/settings/CompactShell.svelte': ['.quick-toggles-scroll'],
  'lib/components/styleguide/ScrollCueSpecimens.svelte': ['.cue-scroller'],
  'routes/beta/+page.svelte': DOCUMENT_SCROLLER,
  'routes/changelog/+page.svelte': DOCUMENT_SCROLLER,
  'routes/feedback/+page.svelte': DOCUMENT_SCROLLER,
};

const SRC_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Every `<style>` element, including ones inside `<noscript>` markup. */
const STYLE_ELEMENT = /<style[^>]*>([\s\S]*?)<\/style>/g;

function svelteFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svelteFilesUnder(path);
    return entry.name.endsWith('.svelte') ? [path] : [];
  });
}

function markup(source: string): string {
  return source.replace(STYLE_ELEMENT, '');
}

/** The component's own style block is the last one in the file; any earlier
 *  `<style>` sits inside markup such as a `<noscript>` fallback. */
function componentStyle(source: string): string {
  const blocks = [...source.matchAll(STYLE_ELEMENT)];
  return blocks.at(-1)?.[1] ?? '';
}

interface Declaration {
  property: string;
  value: string;
}

interface Rule {
  selector: string;
  context: string[];
  declarations: Declaration[];
}

function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}' && (depth -= 1) === 0) return i;
  }
  throw new Error('unbalanced braces');
}

/** In source order, since a later declaration of the same side wins. */
function parseDeclarations(body: string): Declaration[] {
  const declarations: Declaration[] = [];
  for (const statement of body.split(';')) {
    const colon = statement.indexOf(':');
    if (colon === -1) continue;
    declarations.push({
      property: statement.slice(0, colon).trim(),
      value: statement.slice(colon + 1).trim(),
    });
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
  return parseRules(componentStyle(source).replace(/\/\*[\s\S]*?\*\//g, ''));
}

function declared(rule: Rule, property: string): string | undefined {
  return rule.declarations.findLast((d) => d.property === property)?.value;
}

function establishesScrollport(rule: Rule): boolean {
  const overflow = declared(rule, 'overflow-y') ?? declared(rule, 'overflow') ?? '';
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

/** The bottom edge as the cascade leaves it after the rule's last word on the
 *  subject: the physical and logical longhands (`padding-bottom`,
 *  `padding-block-end` — the app is horizontal-tb, so block-end is bottom) and
 *  both shorthands. */
function bottomPadding(rule: Rule): string | undefined {
  let bottom: string | undefined;
  for (const { property, value } of rule.declarations) {
    if (property === 'padding-bottom' || property === 'padding-block-end') bottom = value;
    else if (property === 'padding-block') {
      // `padding-block: start end` / `padding-block: both`.
      const terms = shorthandTerms(value);
      bottom = terms[1] ?? terms[0];
    } else if (property === 'padding') {
      // `padding: a` / `a b` / `a b c` / `a b c d`: bottom is a, a, c, c.
      const terms = shorthandTerms(value);
      bottom = terms.length < 3 ? terms[0] : terms[2];
    }
  }
  return bottom;
}

/** `0` and `0px` are the same length. */
function normalizeLength(value: string): string {
  return value === '0' ? '0px' : value;
}

function label(rule: Rule): string {
  return [...rule.context, rule.selector].join(' > ');
}

describe('every scroller hosting a bare ScrollCue declares the padding its fade reaches past', () => {
  const sources = new Map(
    svelteFilesUnder(SRC_ROOT).map((path) => [relative(SRC_ROOT, path), readFileSync(path, 'utf8')])
  );
  const hosts = [...sources].filter(([, source]) => BARE_SCROLL_CUE.test(markup(source)));

  it('classifies every component that renders a bare ScrollCue', () => {
    expect(hosts.map(([file]) => file).sort()).toEqual(Object.keys(HOSTS).sort());
  });

  for (const [file, source] of hosts) {
    const rules = styleRules(source);
    const scrollers = [...new Set(rules.filter(establishesScrollport).map((r) => r.selector))];
    const expected = HOSTS[file];

    it(`${file}: its scrollers are the ones on record`, () => {
      expect(scrollers.sort()).toEqual(expected === DOCUMENT_SCROLLER ? [] : [...expected].sort());
    });

    for (const selector of scrollers) {
      const own = rules.filter((rule) => rule.selector === selector);

      it(`${file}: \`${selector}\` declares ${SCROLLPORT_BOTTOM_PADDING_PROPERTY}`, () => {
        expect(own.some((rule) => declared(rule, SCROLLPORT_BOTTOM_PADDING_PROPERTY))).toBe(true);
      });

      for (const rule of own) {
        const bottom = bottomPadding(rule);
        if (bottom === undefined) continue;
        it(`${file}: \`${label(rule)}\` pads its bottom by the property it declares`, () => {
          const property = declared(rule, SCROLLPORT_BOTTOM_PADDING_PROPERTY);
          expect(property, 'a rule that pads the scroller redeclares the property').toBeDefined();
          if (bottom === `var(${SCROLLPORT_BOTTOM_PADDING_PROPERTY})`) return;
          expect(normalizeLength(bottom)).toBe(normalizeLength(property!));
        });
      }
    }
  }
});
