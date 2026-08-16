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
// The reading is **fail-closed**, because the only thing worse than no guard is
// one that reports success on input it did not understand. YAML admits three
// scalar forms and this file has to handle all of them: an earlier revision
// matched single quotes alone, so `tapOn: "About"` and `tapOn: About` were
// dropped on the floor while the suite stayed green — the very silent drift the
// guard exists to end. Anything unparsable, and any key not named below, is a
// reported problem rather than a skipped line.
const repoRoot = join(import.meta.dirname, '..', '..');
const flow = readFileSync(join(repoRoot, '.maestro', 'smoke.yaml'), 'utf8');
const flowBody = flow.slice(flow.indexOf('\n---\n'));

/** Keys whose value is an on-screen label the app has to render. */
const LABEL_KEYS = new Set([
  'assertNotVisible',
  'assertVisible',
  'longPressOn',
  'notVisible',
  'tapOn',
  'text',
  'visible',
]);

// Every other key the flow is allowed to use. ADR-0120 freezes this flow at a
// boot check, so a new key is a decision, not a detail: an unrecognized one
// fails here and has to be classified — label-bearing or not — by hand.
const STRUCTURAL_KEYS = new Set([
  'clearState',
  'extendedWaitUntil',
  'launchApp',
  'takeScreenshot',
  'timeout',
]);

const KEY_LINE = /^\s*(?:- )?([A-Za-z][A-Za-z0-9_]*):(.*)$/;

/**
 * A YAML scalar in any of its three forms.
 *
 * Returns the string, `undefined` when the key opens a block (its value sits on
 * the following lines), or `null` when the text is not a form this understands
 * — which the caller reports rather than ignores.
 */
export function parseScalar(rest) {
  const value = rest.trim();
  if (value === '') return undefined;
  for (const quote of ["'", '"']) {
    if (!value.startsWith(quote)) continue;
    const closed = value.length > 1 && value.endsWith(quote);
    return closed ? value.slice(1, -1) : null;
  }
  // A plain scalar ends at an inline comment; a quoted one cannot, which is why
  // this only applies here.
  return value.split(' #')[0].trim();
}

export function readFlowSelectors(body) {
  const labels = [];
  const problems = [];
  for (const line of body.split('\n')) {
    const match = line.match(KEY_LINE);
    if (!match) continue;
    const [, key, rest] = match;
    if (LABEL_KEYS.has(key)) {
      const value = parseScalar(rest);
      if (value === null) problems.push(`${key}: unparsable selector ${rest.trim()}`);
      else if (value !== undefined) labels.push(value);
      continue;
    }
    if (!STRUCTURAL_KEYS.has(key)) {
      problems.push(
        `unrecognized key "${key}" — add it to LABEL_KEYS or STRUCTURAL_KEYS so the guard states ` +
          'whether it carries a selector'
      );
    }
  }
  return { labels, problems };
}

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

const { labels, problems } = readFlowSelectors(flowBody);

describe('flow reader', () => {
  // The controls that keep the guard from passing on input it never read. Each
  // case carries its own expectation so a form that stops being extracted fails
  // here rather than going quiet in the checks below.
  it.each([
    { form: 'single-quoted', line: "- tapOn: 'About'", expected: ['About'] },
    { form: 'double-quoted', line: '- tapOn: "About"', expected: ['About'] },
    { form: 'plain', line: '- tapOn: About', expected: ['About'] },
    { form: 'plain with a comment', line: '- tapOn: About # the last row', expected: ['About'] },
    { form: 'nested under a command', line: '    text: "About"', expected: ['About'] },
    { form: 'block, value on later lines', line: '- tapOn:', expected: [] },
  ])('extracts a $form selector', ({ line, expected }) => {
    expect(readFlowSelectors(line).labels).toEqual(expected);
  });

  it.each([
    { form: 'unterminated single quote', line: "- tapOn: 'About" },
    { form: 'unterminated double quote', line: '- tapOn: "About' },
  ])('reports a $form rather than skipping it', ({ line }) => {
    expect(readFlowSelectors(line).problems).toHaveLength(1);
  });

  it('reports a key it has not been taught', () => {
    expect(readFlowSelectors('- swipe:').problems).toEqual([
      'unrecognized key "swipe" — add it to LABEL_KEYS or STRUCTURAL_KEYS so the guard states ' +
        'whether it carries a selector',
    ]);
  });
});

describe('native smoke flow', () => {
  it('is written entirely in forms the guard understands', () => {
    expect(problems).toEqual([]);
    expect(labels.length).toBeGreaterThan(0);
  });

  it('selects only labels the app still renders', () => {
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(
        [...ariaLabels],
        `.maestro/smoke.yaml selects "${label}", which no literal aria-label in web/src declares`
      ).toContain(label);
    }
  });

  // Maestro matches a text selector against the whole string, so a label that
  // grows a sibling in the same element stops matching while both the app and
  // the flow still read as correct. That is the failure the flow hit at its
  // last repair, and a `.*` on the end of every selector is what makes it
  // invisible — so the check above is only sound while the selectors stay exact.
  it('selects by exact label rather than by pattern', () => {
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label, `"${label}" selects by pattern`).not.toMatch(/[.*+?^$[\]{}()|\\]/);
    }
  });
});
