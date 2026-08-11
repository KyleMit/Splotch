export interface PaletteColor {
  hex: string;
  label: string;
}

// The near-black ink. On dark paper it vanishes, so in dark mode the palette
// presents (and paints) this swatch as white instead — same position, same trim
// priority, only the pixels change (see themedSwatchColor / ColorPalette).
export const BLACK_INK = '#0a0b10';

// `as const` narrows each label to a literal so PaletteLabel can be derived from
// the list itself; the exported view widens `hex` back to string, because
// consumers compare it against non-palette values ('custom' in ColorPalette).
const PALETTE_SOURCE = [
  { hex: '#AB71E1', label: 'Purple' },
  { hex: '#7A74E7', label: 'Indigo' },
  { hex: '#62A2E9', label: 'Blue' },
  { hex: '#4FC4C0', label: 'Teal' },
  { hex: '#5CCC90', label: 'Mint' },
  { hex: '#8CC864', label: 'Green' },
  { hex: '#BEDD40', label: 'Lime' },
  { hex: '#F9D24F', label: 'Yellow' },
  { hex: '#F89C45', label: 'Orange' },
  { hex: '#B5835A', label: 'Brown' },
  { hex: '#EC534E', label: 'Red' },
  { hex: '#F47CB0', label: 'Pink' },
  { hex: '#E25AD7', label: 'Magenta' },
  { hex: '#9AA0AC', label: 'Grey' },
  { hex: BLACK_INK, label: 'Black' },
] as const satisfies readonly PaletteColor[];

// Display order, top-to-bottom (landscape) / left-to-right (portrait): one walk
// down the color wheel from purple around to magenta, then the two neutrals, so
// the bar reads as a spectrum however much of it is on screen. Which swatches
// render is a separate question — the palette shows as many as fit, dropping
// them in TRIM_ORDER priority (see the trim rules in ColorPalette.svelte).
// Purple must stay at index 0 — it's the default selection.
export const PALETTE_COLORS: readonly PaletteColor[] = PALETTE_SOURCE;

/** Every swatch label in PALETTE_COLORS — a closed vocabulary, not a string. */
export type PaletteLabel = (typeof PALETTE_SOURCE)[number]['label'];

/**
 * Look up a swatch by its display label, for UI that wants a specific crayon hue
 * (the /android-beta masthead strip and its callout accents). Renaming a swatch
 * is a compile error at every call site rather than a blank render; the throw is
 * belt-and-braces for callers that reach this from untyped code.
 * palette-source.test.mjs keeps this file the only place those hexes are written.
 */
export function paletteHex(label: PaletteLabel): string {
  const color = PALETTE_COLORS.find((entry) => entry.label === label);
  if (!color) throw new Error(`No palette color labelled "${label}"`);
  return color.hex;
}

/**
 * Crayon-box sizes, smallest first — how much room the palette needs before a
 * swatch earns a slot. `core` is the rainbow any viewport with room for a
 * swatch at all gets first; `bonus` and `deluxe` fill the spectrum in as the
 * bar grows, so a big tablet gets the whole box and a phone still gets a
 * rainbow rather than a random handful.
 */
const PALETTE_TIERS = ['core', 'bonus', 'deluxe'] as const;
type PaletteTier = (typeof PALETTE_TIERS)[number];

/**
 * Trim priority within each box — first listed is the first to be hidden. Among
 * the core hues red goes first, then orange, green, yellow; blue and purple (the
 * default selection) hang on longer, and black is kept the longest. The Record
 * makes the compiler demand a list for every tier, so a new swatch can't join
 * the display order without being given a place in the trim order.
 */
const TIER_TRIM_PRIORITY: Record<PaletteTier, readonly PaletteLabel[]> = {
  core: ['Red', 'Orange', 'Green', 'Yellow', 'Blue', 'Purple', 'Black'],
  bonus: ['Brown', 'Teal', 'Pink'],
  deluxe: ['Grey', 'Lime', 'Indigo', 'Magenta', 'Mint'],
};

/**
 * Every swatch by trim priority: first listed is the first to be hidden, last is
 * kept the longest. Independent of the display order above — the biggest box is
 * emptied first, so this reads PALETTE_TIERS backwards. ColorPalette tags each
 * swatch with its index here and the CSS ladders trim by that rank.
 */
export const TRIM_ORDER: readonly string[] = [...PALETTE_TIERS]
  .reverse()
  .flatMap((tier) => TIER_TRIM_PRIORITY[tier].map((label) => paletteHex(label)));
