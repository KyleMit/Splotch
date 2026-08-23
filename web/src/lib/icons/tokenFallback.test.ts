// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { iconTokenEntries } from '../design/iconTokens';
import { themes, toCssVarName } from '../design/tokens';

// The SVG side of the token wiring has no compile-time link to the token side:
// an icon paints with `style="fill:var(--icon-camera-body,#3f68a8)"`, and both
// the name and the fallback hex are plain strings nobody type-checks. This walks
// every shipped icon and closes that gap in both directions.
//
// Forward: a fallback that drifts from its light value is invisible in the app
// (the var always resolves) and only shows up where the raw file renders —
// GitHub previews, a design-tool round-trip.
//
// Reverse: the realistic failure is an artist re-exporting an icon from source,
// which silently wipes the var() and reverts the path to its baked light hex. No
// error, no visual change in light mode, just a dark-mode regression nobody
// notices for a month. The reverse check turns that into a red test.
const svgs = import.meta.glob<string>('./*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// `matchAll` (not `match`) so a file with more than one occurrence — like
// line-weight-eraser.svg's three circles or camera.svg's two flash bursts —
// gets every fallback checked, not just the first. Optional whitespace after
// the comma tolerates the `var(--x, #hex)` spelling used elsewhere in the repo.
const FALLBACK_RE = /var\((--[a-z0-9-]+),\s*(#[0-9a-fA-F]{3,8})\)/g;

const fallbacks = (src: string) =>
  [...src.matchAll(FALLBACK_RE)].map(([, cssVar, hex]) => ({ cssVar, hex }));

const lightByCssVar = new Map<string, string>([
  ...Object.entries(themes.light).map(
    ([key, value]) => [toCssVarName(key), value] as [string, string]
  ),
  ...iconTokenEntries().map(({ cssVar, light }) => [cssVar, light] as [string, string]),
]);

// The semantic (non per-icon) tokens an SVG is allowed to paint with. Pinned as
// a list rather than a count so deleting the last size-eraser fallback fails
// loudly instead of leaving every case below passing vacuously — and so adding
// a new one is a deliberate edit here.
const SEMANTIC_TOKENS_IN_SVGS = ['--hole-stroke', '--paper'];

const allFallbacks = Object.values(svgs).flatMap(fallbacks);

describe('icon token fallbacks match the light theme', () => {
  it.each(Object.entries(svgs))('%s', (_path, src) => {
    for (const { cssVar, hex } of fallbacks(src)) {
      expect(lightByCssVar.get(cssVar), `${cssVar} is not a declared token`).toBeDefined();
      expect(hex).toBe(lightByCssVar.get(cssVar));
    }
  });

  it('paints only with the semantic tokens meant for SVGs', () => {
    const semantic = allFallbacks
      .map(({ cssVar }) => cssVar)
      .filter((cssVar) => !cssVar.startsWith('--icon-'));
    expect([...new Set(semantic)].sort()).toEqual(SEMANTIC_TOKENS_IN_SVGS);
  });

  it('references every part declared in iconThemes', () => {
    const referenced = new Set(allFallbacks.map(({ cssVar }) => cssVar));
    const orphaned = iconTokenEntries()
      .map(({ cssVar }) => cssVar)
      .filter((cssVar) => !referenced.has(cssVar));
    expect(orphaned).toEqual([]);
  });
});
