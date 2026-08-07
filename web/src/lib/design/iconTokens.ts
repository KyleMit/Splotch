import type { CommonIconName } from '../components/iconTypes';
import { toKebabCase } from './tokens.ts';

// Per-icon-part theme colors for the full-color "spot" icons (ADR-0102).
//
// The monochrome glyphs bake `fill="#1f1f1f"` and get re-inked wholesale by one
// `--icon-ink` rule in app.css (ADR-0052). Spot icons opt out of that rule —
// they carry their own palette — so nothing themed them until this map. Each
// entry names one path inside one icon and gives it a light and a dark fill;
// `npm run gen:tokens` emits them as `--icon-<icon>-<part>` alongside the
// semantic tokens, and the SVG paints with `style="fill:var(--icon-…,#light)"`.
//
// These deliberately do NOT live in `ThemeTokens`. That interface is the curated
// semantic vocabulary two prunes (ADR-0097, ADR-0098) narrowed on purpose; a
// per-asset lookup table that grows an entry per illustration belongs beside it,
// not in it. Nothing here is reachable from a component style — an entry only
// ever paints the one path that names it.
//
// Keyed by `CommonIconName` so renaming or deleting an icon fails to compile,
// which is the only compile-time link to the SVG side (the paint value is a
// plain string). The rest is covered at test time by the bidirectional drift
// guard in ../icons/tokenFallback.test.ts.

// Module-local, all three: the map and its shape are an implementation detail
// of `iconTokenEntries()`, which is the only view anything outside this file
// needs. Exporting the map would also invite a component style to reference an
// entry, which is exactly the reachability line that keeps these out of
// `ThemeTokens`.
interface IconPartTheme {
  light: string;
  dark: string;
}

type IconThemes = Partial<Record<CommonIconName, Record<string, IconPartTheme>>>;

// Why these values: the same icon rests on `--surface`/`--surface-2` and on the
// near-constant `--brand-solid` (#7c50bb light, #8058c0 dark), so each theme's
// colors have to clear both its ground and that purple. That pushes the two sets
// away from the middle rather than toward each other — in light the blues go
// deeper, in dark they go paler. Where one shape shades against a neighbour
// (rocket body vs. window, brush handle vs. ferrule) the two sets invert the
// relationship instead of preserving it.
const iconThemes = {
  // Worst offender before the pass: at #212d4c the night half measured 1.00:1
  // against the dark card — mathematically identical luminance — so the moon
  // dissolved and left a sun with stars floating beside it.
  appearance: {
    night: { light: '#212d4c', dark: '#93a6d6' },
  },
  camera: {
    body: { light: '#3f68a8', dark: '#86aee0' },
    // Stays the darker of the two in both sets so the lens reads as recessed.
    lens: { light: '#33487c', dark: '#6b8cc0' },
    // The one part that darkens for light and keeps its original value for
    // dark: amber-yellow already reads on both dark grounds, and only white
    // paper needed the deeper burst.
    flash: { light: '#d97b06', dark: '#fabb19' },
  },
  // Purple tracks on the purple selected card measured 1.56:1. Light deepens to
  // indigo; dark leaves the brand hue entirely, since a lighter purple would
  // still collapse into that card.
  controls: {
    track: { light: '#3d2570', dark: '#8fbdea' },
  },
  'magic-brush': {
    handle: { light: '#3a2470', dark: '#d5c4f5' },
    // The cream original was near-invisible on paper, so it becomes the metal
    // the shape already wanted. It must be lighter than the handle in light and
    // darker than it in dark — the inversion, and the thing to check first if
    // the brush ever looks flat.
    ferrule: { light: '#6e7d99', dark: '#8fa0bd' },
  },
  'save-picture': {
    photo: { light: '#5699cd', dark: '#7db4e0' },
  },
  // #326998 and #7c50bb have near-identical luminance (1.03:1), which is why the
  // phone body disappeared on the selected row and left the check floating.
  setup: {
    chrome: { light: '#1c4c78', dark: '#8ab8e4' },
  },
  shapes: {
    car: { light: '#007dfe', dark: '#5aa8fe' },
  },
  sound: {
    cone: { light: '#0f5aa6', dark: '#5aa6e8' },
    coneHighlight: { light: '#1781ee', dark: '#86c7fa' },
  },
  'wand-stars': {
    wand: { light: '#4a1a9e', dark: '#bb96f0' },
    // Same source color as the wand, moving the opposite way in dark: the badge
    // carries the cream "AI" letters, which need a deep plate under them. The
    // light values match by coincidence, not by sharing — do not merge them.
    badge: { light: '#4a1a9e', dark: '#4c1d95' },
  },
  // The rocket's three body tones must stay distinct and in the same lightness
  // order (shadow < mid < body) or it goes flat. The window inverts: once the
  // body is pale, a pale window vanishes into it.
  'whats-new': {
    body: { light: '#2a8cdc', dark: '#8ecdf8' },
    mid: { light: '#277ec1', dark: '#6fb4e8' },
    shadow: { light: '#1e3a6c', dark: '#6d94c8' },
    window: { light: '#bedaf2', dark: '#1f4e7d' },
  },
} satisfies IconThemes;

/** `('whats-new', 'window')` → `--icon-whats-new-window`. */
export function toIconCssVarName(icon: string, part: string): string {
  return `--icon-${toKebabCase(icon)}-${toKebabCase(part)}`;
}

/** Every declared part, flattened — what the generator emits and the drift guard walks. */
export function iconTokenEntries(): { cssVar: string; light: string; dark: string }[] {
  return Object.entries(iconThemes as IconThemes).flatMap(([icon, parts]) =>
    Object.entries(parts ?? {}).map(([part, { light, dark }]) => ({
      cssVar: toIconCssVarName(icon, part),
      light,
      dark,
    }))
  );
}
