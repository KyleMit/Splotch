// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { themes } from '../design/tokens';

// Catches the eraser-size icons' inline var(...,#hex) fallbacks drifting from
// themes.light — nothing else notices since the CSS var always resolves in-app.
const svgs = import.meta.glob<string>('./*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// `matchAll` (not `match`) so a file with more than one occurrence — like
// line-weight-eraser.svg's three circles — gets every fallback checked, not
// just the first. Optional whitespace after the comma tolerates the
// `var(--x, #hex)` spelling already used elsewhere in the repo (e.g. --app-bg).
const PAPER_FALLBACK_RE = /var\(--paper,\s*(#[0-9a-fA-F]{3,8})\)/g;
const HOLE_STROKE_FALLBACK_RE = /var\(--hole-stroke,\s*(#[0-9a-fA-F]{3,8})\)/g;

const fallbackHexes = (src: string, pattern: RegExp) =>
  [...src.matchAll(pattern)].map(([, hex]) => hex);

// The six icons the finding names (eraser-size-1..5, line-weight-eraser) — if
// this drops, the regexes stopped matching anything (fallback removed, var
// renamed, spelling changed) and every it.each case below would otherwise pass
// vacuously with zero assertions.
const ICONS_WITH_TOKEN_FALLBACKS = 6;

describe('icon token fallbacks match themes.light', () => {
  it.each(Object.entries(svgs))('%s', (_path, src) => {
    for (const hex of fallbackHexes(src, PAPER_FALLBACK_RE)) {
      expect(hex).toBe(themes.light.paper);
    }
    for (const hex of fallbackHexes(src, HOLE_STROKE_FALLBACK_RE)) {
      expect(hex).toBe(themes.light.holeStroke);
    }
  });

  it('checks fallbacks in every icon that has one', () => {
    const filesWithFallbacks = Object.values(svgs).filter(
      (src) =>
        fallbackHexes(src, PAPER_FALLBACK_RE).length > 0 ||
        fallbackHexes(src, HOLE_STROKE_FALLBACK_RE).length > 0
    );
    expect(filesWithFallbacks).toHaveLength(ICONS_WITH_TOKEN_FALLBACKS);
  });
});
