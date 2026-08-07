// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Icons are inlined into one document (the drawing route renders the Actions
// Panel and the Color Palette side by side), so an id is global the moment two
// icons carrying it are on screen together — `url(#x)` and `href="#x"` both
// resolve to whichever element came first, and one of the two icons paints
// wrong with no error anywhere. Nothing else notices: each file is valid on its
// own, and the collision only appears in the composed page.
//
// The pressure toward collision is mechanical rather than accidental. SVGO's
// `cleanupIds` (scripts/image-audit.mjs) minifies ids to `a`, `b`, … per file,
// so two independently authored icons converge on the same short name — which
// is how more-colors.svg came to hold `id="a"`. An id that must stay stable
// opts out by starting with `icon-`; this guard is what makes the opt-out
// enforceable rather than a convention, and it runs against the optimized form
// CI already pins via `img:audit:check`.
const svgs = import.meta.glob<string>('./*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const ID_RE = /\bid="([^"]+)"/g;
const REFERENCE_RE = /(?:url\(#([^)]+)\)|href="#([^"]+)")/g;

const ids = (src: string) => [...src.matchAll(ID_RE)].map(([, id]) => id);

const references = (src: string) =>
  [...src.matchAll(REFERENCE_RE)].map(([, urlId, hrefId]) => urlId ?? hrefId);

describe('icon ids', () => {
  it('are unique across every icon', () => {
    const owners = new Map<string, string[]>();
    for (const [path, src] of Object.entries(svgs)) {
      for (const id of ids(src)) owners.set(id, [...(owners.get(id) ?? []), path]);
    }
    const collisions = [...owners].filter(([, paths]) => paths.length > 1);
    expect(
      collisions.map(([id, paths]) => `${id}: ${paths.join(', ')}`),
      'prefix an id with `icon-` to keep SVGO from minifying it into a neighbor'
    ).toEqual([]);
  });

  // The counterpart failure: renaming an id but missing one of its `url(#…)`
  // sites leaves a path filled with nothing, which reads as an invisible icon.
  it.each(Object.entries(svgs))('%s resolves every internal reference', (_path, src) => {
    const declared = new Set(ids(src));
    for (const ref of references(src)) {
      expect(declared.has(ref), `#${ref} is referenced but never declared`).toBe(true);
    }
  });
});
