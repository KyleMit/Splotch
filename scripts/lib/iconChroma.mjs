// Chroma-based icon classification, shared by the icon-sheet generator
// (gen-icons-sheet.mjs) and the COLOR_ICONS guard test
// (web/src/lib/components/Icon.svelte.test.ts) so the two never drift.
//
// An icon is a "spot" (full-color) icon when it PAINTS at least one saturated,
// mid-range hue via a fill/stroke/stop-color — as opposed to a monochrome glyph
// that only ever paints black, white, grey, or currentColor. Classifying by the
// painted color (rather than any hex found anywhere in the file) keeps a hex in
// non-paint text — e.g. the `[#142]` icon id inside github.svg's <title> — from
// being mistaken for a color.

// #rgb / #rrggbb (with optional alpha) -> {s, l} in 0..1. Returns s=0 for the
// grey axis (r==g==b) so pure black/white/grey never register as a hue.
export function chroma(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.replace(/./g, (c) => c + c);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

// A painted color reads as a hue when it is saturated and neither too dark nor
// too light (near-black ink and near-white paper are monochrome, not spot).
function isHue(hex) {
  const c = chroma(hex);
  return c.s >= 0.35 && c.l >= 0.14 && c.l <= 0.93;
}

// The hex colors an SVG actually paints, via a fill/stroke/stop-color attribute
// or CSS declaration. Ignores hex sitting in titles, ids, or other text.
function paintHexes(svg) {
  const set = new Set();
  for (const m of svg.matchAll(
    /(?:fill|stroke|stop-color)\s*[:=]\s*['"]?\s*(#[0-9a-fA-F]{3,8})\b/gi
  ))
    set.add(m[1].toLowerCase());
  return [...set];
}

// An icon is colorful ("spot") when it paints at least one saturated hue.
export function isSpot(svg) {
  return paintHexes(svg).some(isHue);
}
