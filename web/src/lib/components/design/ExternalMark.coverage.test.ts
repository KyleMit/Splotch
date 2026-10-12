// @vitest-environment node
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

// Every <a> that sets a target opens outside Splotch (a new tab on the web, the
// system browser in the native apps), so it carries ExternalMark: the cue a
// grown-up reads before the parental gate, and the "(opens outside Splotch)" a
// screen reader hears. Nothing about writing target="_blank" asks for the mark,
// so this scan is what keeps a new outbound link from shipping without it.
const sources = import.meta.glob<string>(['../../../**/*.svelte'], {
  eager: true,
  query: '?raw',
  import: 'default',
});

// Button's <a> forwards its caller's target. A filled action button already
// says what it does in its label, and a blob inside the fill reads as clutter.
const EXEMPT_FILES = new Set(['./Button.svelte']);

type Node = { type?: string; name?: string; start?: number; attributes?: Node[] };

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null;
}

function findAll(root: unknown, match: (node: Node) => boolean, found: Node[] = []): Node[] {
  if (Array.isArray(root)) {
    for (const child of root) findAll(child, match, found);
  } else if (isNode(root)) {
    if (match(root)) found.push(root);
    for (const [key, child] of Object.entries(root)) {
      if (key !== 'metadata' && key !== 'parent') findAll(child, match, found);
    }
  }
  return found;
}

const isTargetedAnchor = (node: Node) =>
  node.type === 'RegularElement' &&
  node.name === 'a' &&
  (node.attributes ?? []).some((attr) => attr.type === 'Attribute' && attr.name === 'target');

const isExternalMark = (node: Node) => node.type === 'Component' && node.name === 'ExternalMark';

// The source offset of every targeted anchor with no ExternalMark inside it.
function unmarkedOutboundLinks(source: string): number[] {
  const { fragment } = parse(source, { modern: true });
  return findAll(fragment, isTargetedAnchor)
    .filter((anchor) => findAll(anchor, isExternalMark).length === 0)
    .map((anchor) => anchor.start ?? -1);
}

describe('outbound links', () => {
  it('flags a targeted anchor without the mark (positive control)', () => {
    const source = `{#if ok}<p><a href="https://example.com" target="_blank">Out</a></p>{/if}`;
    expect(unmarkedOutboundLinks(source)).toHaveLength(1);
  });

  it('accepts a targeted anchor holding the mark', () => {
    const source = `<a href="https://example.com" target="_blank">Out<ExternalMark variant="inline" /></a>`;
    expect(unmarkedOutboundLinks(source)).toEqual([]);
  });

  it.each([...EXEMPT_FILES])('still has the exempt file %s', (path) => {
    expect(Object.keys(sources)).toContain(path);
  });

  it.each(Object.entries(sources).filter(([path]) => !EXEMPT_FILES.has(path)))(
    '%s marks every link that opens outside Splotch',
    (_path, source) => {
      expect(unmarkedOutboundLinks(source)).toEqual([]);
    }
  );
});
