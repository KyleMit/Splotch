// The candidate import boundary excludes shipping web source; native-drawing-tokens.test.mjs pins this projection.
export const PALETTE_COLORS = [
  {
    hex: '#AB71E1',
    label: 'Purple',
  },
  {
    hex: '#7A74E7',
    label: 'Indigo',
  },
  {
    hex: '#62A2E9',
    label: 'Blue',
  },
  {
    hex: '#4FC4C0',
    label: 'Teal',
  },
  {
    hex: '#5CCC90',
    label: 'Mint',
  },
  {
    hex: '#8CC864',
    label: 'Green',
  },
  {
    hex: '#BEDD40',
    label: 'Lime',
  },
  {
    hex: '#F9D24F',
    label: 'Yellow',
  },
  {
    hex: '#F89C45',
    label: 'Orange',
  },
  {
    hex: '#B5835A',
    label: 'Brown',
  },
  {
    hex: '#EC534E',
    label: 'Red',
  },
  {
    hex: '#F47CB0',
    label: 'Pink',
  },
  {
    hex: '#E25AD7',
    label: 'Magenta',
  },
  {
    hex: '#9AA0AC',
    label: 'Grey',
  },
  {
    hex: '#0a0b10',
    label: 'Black',
  },
] as const;

export type PaletteLabel = (typeof PALETTE_COLORS)[number]['label'];

export function paletteHex(label: PaletteLabel): string {
  const color = PALETTE_COLORS.find((entry) => entry.label === label);
  if (!color) throw new Error(`No palette color labelled "${label}"`);
  return color.hex;
}

export type CustomColor = `#${string}`;
export type PaintColor = PaletteLabel | CustomColor;
export const CUSTOM_SWATCH = 'custom';
export type PaintSwatch = PaletteLabel | typeof CUSTOM_SWATCH;
export type ColorSettings = Readonly<{
  selectedColor: PaintColor;
  customColors: readonly CustomColor[];
  activeSwatch: PaintSwatch;
}>;
export type CustomPaintSelection = Readonly<{ color: CustomColor | null }> | null;
export const MAX_CUSTOM_COLORS = 6;
export const DEFAULT_COLOR_SETTINGS: ColorSettings = {
  selectedColor: 'Purple',
  customColors: [],
  activeSwatch: 'Purple',
};

export function customPaintSelection(
  settings: Pick<ColorSettings, 'selectedColor' | 'activeSwatch'>,
  erasing: boolean
): CustomPaintSelection {
  return !erasing && settings.activeSwatch === CUSTOM_SWATCH
    ? { color: isCustomColor(settings.selectedColor) ? settings.selectedColor : null }
    : null;
}

// The shipping bar's trim priority: first listed is the first hidden when the bar runs out of room.
export const PALETTE_TRIM_ORDER = [
  'Grey',
  'Lime',
  'Indigo',
  'Magenta',
  'Mint',
  'Brown',
  'Teal',
  'Pink',
  'Red',
  'Orange',
  'Green',
  'Yellow',
  'Blue',
  'Purple',
  'Black',
] as const satisfies readonly PaletteLabel[];

export function visiblePaints(slots: number): PaletteLabel[] {
  const kept = new Set(
    PALETTE_TRIM_ORDER.slice(Math.max(0, PALETTE_TRIM_ORDER.length - Math.max(0, slots)))
  );
  return PALETTE_COLORS.map((color) => color.label).filter((color) => kept.has(color));
}

export function isPaletteLabel(value: unknown): value is PaletteLabel {
  return PALETTE_COLORS.some((entry) => entry.label === value);
}

export function isCustomColor(value: unknown): value is CustomColor {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/.test(value);
}

export function isPaintColor(value: unknown): value is PaintColor {
  return isPaletteLabel(value) || isCustomColor(value);
}

export function paintHex(color: PaintColor): string {
  if (isPaletteLabel(color)) return paletteHex(color);
  if (isCustomColor(color)) return color;
  throw new Error('Paint color is invalid.');
}

export function paintAppearance(color: PaintColor, theme: PaperTheme) {
  const reversed = color === 'Black' && theme === 'dark';
  const hex = reversed ? WHITE_PAINT : paintHex(color);
  return {
    hex,
    definitionId: `ink-${hex.slice(1).toLowerCase()}`,
    selectionMark: reversed ? paletteHex('Black') : WHITE_PAINT,
    glaze: reversed ? ('lighten' as const) : ('darken' as const),
  };
}

export function paintId(color: PaintColor): string {
  return `ink-${paintHex(color).slice(1).toLowerCase()}`;
}

export const CUSTOM_COLOR_LABEL = 'Custom Color';

export function paintLabel(color: PaintColor, theme: PaperTheme): string {
  if (!isPaletteLabel(color)) return CUSTOM_COLOR_LABEL;
  return color === 'Black' && theme === 'dark' ? 'White' : color;
}

export function rememberColor(
  colors: readonly CustomColor[],
  color: CustomColor
): readonly CustomColor[] {
  if (!isCustomColor(color)) throw new Error('Custom paint color is invalid.');
  return [color, ...colors.filter((entry) => entry !== color)].slice(0, MAX_CUSTOM_COLORS);
}
import type { PaperTheme } from './theme';

const WHITE_PAINT = '#ffffff';
