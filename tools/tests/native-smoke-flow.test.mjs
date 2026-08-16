import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The native smoke flow selects elements by accessibility label, in YAML, with
// nothing linking those strings to the components that carry them. Both
// workflows that run it are tag-only (ADR-0120), so a rename surfaces as a red
// release gate rather than a failing PR — which is how the flow came to spend
// three releases driving a version-tap gesture and an Admin link that ADR-0101
// had already deleted. This reads both sides on every push instead.
//
// The vocabulary checked is deliberately narrow: an `aria-label` attribute with
// a literal value. A step that instead selects rendered copy is a step this
// guard cannot see, so adding one means extending this to that copy's source —
// leaving it unguarded is what the flow's history argues against.
const repoRoot = join(import.meta.dirname, '..', '..');
const flow = readFileSync(join(repoRoot, '.maestro', 'smoke.yaml'), 'utf8');
const flowBody = flow.slice(flow.indexOf('\n---\n'));

// Every form Maestro takes a text selector in: the shorthand `- tapOn: 'X'`,
// and the `visible:` / `text:` keys of the expanded commands.
const SELECTOR_KEYS =
  /^\s*(?:- )?(?:tapOn|assertVisible|assertNotVisible|visible|text):\s*'([^']+)'/gm;
const selectors = [...flowBody.matchAll(SELECTOR_KEYS)].map(([, selector]) => selector);

function svelteSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svelteSources(path);
    return entry.name.endsWith('.svelte') ? [readFileSync(path, 'utf8')] : [];
  });
}

const ariaLabels = new Set(
  svelteSources(join(repoRoot, 'web', 'src')).flatMap((source) =>
    [...source.matchAll(/aria-label=(?:"([^"{}]*)"|'([^'{}]*)')/g)].map(
      ([, doubleQuoted, singleQuoted]) => doubleQuoted ?? singleQuoted
    )
  )
);

describe('native smoke flow', () => {
  it('selects only labels the app still renders', () => {
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(
        [...ariaLabels],
        `.maestro/smoke.yaml selects "${selector}", which no literal aria-label in web/src declares`
      ).toContain(selector);
    }
  });

  // Maestro matches a text selector against the whole string, so a label that
  // grows a sibling in the same element stops matching while both the app and
  // the flow still read as correct. That is the failure the flow hit at its
  // last repair, and a `.*` on the end of every selector is what makes it
  // invisible — so the guard above is only sound while the selectors stay exact.
  it('selects by exact label rather than by pattern', () => {
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector, `"${selector}" selects by pattern`).not.toMatch(/[.*+?^$[\]{}()|\\]/);
    }
  });
});
