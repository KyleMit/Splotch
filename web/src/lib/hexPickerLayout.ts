// The hexagonal color picker's palette: a 9×9 grid of 9 hue families × 9
// shades (light → dark), arranged two ways. Portrait keeps each family as a
// row with its shades running across; landscape renders the transpose —
// families as columns (rainbow sweeping left → right), shade levels as rows
// (light → dark downward). ColorPicker.svelte renders BOTH grids and lets CSS
// media queries pick one and progressively trim it, so the layout is correct
// on the prerendered first paint with no JS measurement (same rationale as
// ColorPalette.svelte's trim rules). The guiding rule encoded in those trim
// ladders: the viewport's constrained axis drops shades, never hues — even
// the smallest picker offers the whole rainbow. See ADR-0048.

export interface ColorFamily {
  name: string;
  /** Shades, lightest first. Every family has the same count. */
  shades: string[];
}

// Rainbow order. Column/row trimming samples positions evenly (endpoints
// last to go), so this order doubles as the guarantee that any trimmed
// subset still reads as a rainbow.
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

export interface PickerRow {
  key: string;
  colors: string[];
}

/** Portrait grid: one row per family, shades light → dark across. */
export const PORTRAIT_ROWS: PickerRow[] = COLOR_FAMILIES.map((f) => ({
  key: f.name,
  colors: f.shades,
}));

/** Landscape grid: the transpose — one row per shade level, families across. */
export const LANDSCAPE_ROWS: PickerRow[] = COLOR_FAMILIES[0].shades.map((_, s) => ({
  key: `shade-${s + 1}`,
  colors: COLOR_FAMILIES.map((f) => f.shades[s]),
}));
