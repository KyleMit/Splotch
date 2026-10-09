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
