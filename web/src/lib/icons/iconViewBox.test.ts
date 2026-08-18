// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Every icon shares the canonical square viewBox, with alignment baked into
// the coordinate data itself (tools/icons/rebase-icon-viewbox.mjs): one grid
// means any icon dropped into a square box scales identically, and the
// measured padding/centroid keylines stay comparable across the set. Imported
// artwork arrives on foreign grids (Material exports on `0 -960 960 960`),
// which renders fine and still fails here — run
// `npm run gen:icon-viewbox && npm run optimize:svg-assets` to rebase it.
const svgs = import.meta.glob<string>('./*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const CANONICAL_VIEWBOX = '0 0 1000 1000';

// The mascot renders via a Vite URL import (SplotchyIcon), where the file's
// own frame is the source of truth — it is not part of the icon-box keyline.
const EXEMPT = new Set(['./splotchy.svg']);

describe('icon viewBoxes', () => {
  it('every icon sits on the canonical square grid', () => {
    const offGrid = Object.entries(svgs)
      .filter(([path]) => !EXEMPT.has(path))
      .filter(([, svg]) => !svg.includes(`viewBox="${CANONICAL_VIEWBOX}"`))
      .map(([path]) => path);
    expect(offGrid).toEqual([]);
  });

  it('no icon reintroduces root width/height that would override the viewBox', () => {
    const withDimensions = Object.entries(svgs)
      .filter(([path]) => !EXEMPT.has(path))
      .filter(([, svg]) => /<svg\b[^>]*\s(width|height)="/.test(svg))
      .map(([path]) => path);
    expect(withDimensions).toEqual([]);
  });
});
