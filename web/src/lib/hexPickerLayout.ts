// Responsive layout for the hexagonal color picker. The full palette is a 9×9
// grid: 9 hue families × 9 shades (light → dark). When the viewport can't fit
// all of it, the guiding rule is: sacrifice shades before hues, so even the
// smallest picker still offers the whole rainbow.
//
// The grid orients itself to the viewport: in portrait each family is a row
// (shades run across), in landscape the grid transposes so each family is a
// column (shades run down). Either way the *short* viewport axis trims shade
// levels and the long axis trims families — and families only start dropping
// once the long axis is genuinely out of room.
//
// Whatever count fits, the survivors are picked evenly across the ramp
// (e.g. 5 of 9 → 1st, 3rd, 5th, 7th, 9th) so a trimmed shade ramp still spans
// light → dark and a trimmed family list still sweeps the full rainbow.
//
// Rows are computed here and rendered as-is (no media-query display:none), so
// the honeycomb's alternating row offset always alternates — hidden cells can
// never leave a jagged or overlapping arrangement. Pure module, unit-testable.

export interface ColorFamily {
  name: string;
  /** Shades, lightest first. Every family has the same count. */
  shades: string[];
}

// Rainbow order. The even-spread family trim samples this list, so the order
// doubles as the guarantee that any subset still reads as a rainbow.
export const COLOR_FAMILIES: ColorFamily[] = [
  {
    name: 'reds',
    shades: [
      '#FFB3C1',
      '#FF8FA3',
      '#FF6B6B',
      '#EE5A6F',
      '#E63946',
      '#D62828',
      '#C1121F',
      '#9D0208',
      '#6A040F',
    ],
  },
  {
    name: 'oranges',
    shades: [
      '#FFAC81',
      '#FFA07A',
      '#FF9E00',
      '#FF8C42',
      '#FB8500',
      '#F77F00',
      '#E85D3B',
      '#D36135',
      '#C34A36',
    ],
  },
  {
    name: 'yellows',
    shades: [
      '#FFEA00',
      '#FFE66D',
      '#FFD60A',
      '#FFC300',
      '#FFB703',
      '#FFAA00',
      '#F9C74F',
      '#F9B44A',
      '#F9844A',
    ],
  },
  {
    name: 'greens',
    shades: [
      '#AED581',
      '#73E2A7',
      '#8FD694',
      '#52B788',
      '#2ECC71',
      '#10B981',
      '#00B894',
      '#2D6A4F',
      '#1B5E3F',
    ],
  },
  {
    name: 'blues',
    shades: [
      '#90CAF9',
      '#4CC9F0',
      '#64B5F6',
      '#42A5F5',
      '#2196F3',
      '#0096C7',
      '#0077B6',
      '#023E8A',
      '#03045E',
    ],
  },
  {
    name: 'purples',
    shades: [
      '#E0AAFF',
      '#D8A7FF',
      '#C77DFF',
      '#B565D8',
      '#9D4EDD',
      '#9B59B6',
      '#8E44AD',
      '#7209B7',
      '#5A189A',
    ],
  },
  {
    name: 'pinks',
    shades: [
      '#FFB3D9',
      '#FF8AC7',
      '#F06292',
      '#FF4081',
      '#FF006E',
      '#E91E63',
      '#D81B60',
      '#C2185B',
      '#AD1457',
    ],
  },
  {
    name: 'browns',
    shades: [
      '#BCAAA4',
      '#A1887F',
      '#8D6E63',
      '#795548',
      '#6D4C41',
      '#5D4037',
      '#4E342E',
      '#3E2723',
      '#2C1810',
    ],
  },
  {
    name: 'greys',
    shades: [
      '#ffffff',
      '#90A4AE',
      '#78909C',
      '#607D8B',
      '#546E7A',
      '#455A64',
      '#37474F',
      '#263238',
      '#1A1F24',
    ],
  },
];

// Geometry mirrored from ColorPicker.svelte's styles — change them together.
// A hex is 60×69; columns touch (60px pitch) and rows interlock with an 18px
// overlap (51px pitch). Chrome = everything around the hex grid: the 31px
// even-row offset + 32px padding horizontally; the first row's extra height
// (69 − 51 = 18px) + 32px padding + 15px top margin vertically. The dialog is
// capped at 90% of the viewport on both axes.
const HEX_COL_PITCH = 60;
const HEX_ROW_PITCH = 51;
const WIDTH_CHROME = 63;
const HEIGHT_CHROME = 65;
const DIALOG_VIEWPORT_FRACTION = 0.9;
const MIN_COUNT = 2;

export function fitCount(viewportPx: number, chrome: number, pitch: number, max: number): number {
  const usable = viewportPx * DIALOG_VIEWPORT_FRACTION - chrome;
  return Math.max(MIN_COUNT, Math.min(max, Math.floor(usable / pitch)));
}

// `count` evenly spaced indices across 0..total-1, endpoints always included —
// so a trimmed ramp keeps its lightest and darkest shade, and a trimmed
// rainbow keeps its first and last family.
export function spreadIndices(total: number, count: number): number[] {
  if (count >= total) return Array.from({ length: total }, (_, i) => i);
  const step = (total - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(i * step));
}

export interface PickerRow {
  key: string;
  colors: string[];
}

export function buildPickerRows(
  viewportWidth: number,
  viewportHeight: number,
  families: ColorFamily[] = COLOR_FAMILIES
): PickerRow[] {
  const cols = fitCount(viewportWidth, WIDTH_CHROME, HEX_COL_PITCH, families.length);
  const rows = fitCount(viewportHeight, HEIGHT_CHROME, HEX_ROW_PITCH, families[0].shades.length);
  const landscape = viewportWidth >= viewportHeight;

  const familyPick = spreadIndices(families.length, landscape ? cols : rows).map(
    (i) => families[i]
  );
  const shadePick = spreadIndices(families[0].shades.length, landscape ? rows : cols);

  if (landscape) {
    return shadePick.map((s) => ({
      key: `shade-${s + 1}`,
      colors: familyPick.map((f) => f.shades[s]),
    }));
  }
  return familyPick.map((f) => ({
    key: f.name,
    colors: shadePick.map((s) => f.shades[s]),
  }));
}
