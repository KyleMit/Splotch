import { css } from 'react-strict-dom';
import { DRAWING_ON_BRAND, type DrawingTheme } from '../drawing/theme';
import { channels, hexByte } from './colorMix';

// A tile greys through a CSS filter, which React Native's renderers cannot be trusted with: iOS
// drops grayscale() and paints brightness() over a flat tile's whole face. So the native apps paint
// the filter into the tile's own colors instead: its icon markup, its badge and the badge's paper
// ring. Each function acts on the sRGB channels as the Filter Effects shorthand defines it, clamped
// after every step. Icon markup writes every color in hex.
const GRAYSCALE_LUMA = [0.2126, 0.7152, 0.0722] as const;
const CHANNEL_MAX = 255;
const CHANNEL_MID = CHANNEL_MAX / 2;
const MARKUP_HEX_COLOR = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const FILTER_FUNCTION = /^([a-z]+)\(([\d.]+)\)$/;

type Channels = readonly number[];
const FILTER_STEPS = {
  grayscale: (rgb: Channels, amount: number) => {
    const luma = rgb.reduce((sum, value, index) => sum + value * GRAYSCALE_LUMA[index], 0);
    return rgb.map((value) => value + (luma - value) * amount);
  },
  contrast: (rgb: Channels, amount: number) =>
    rgb.map((value) => (value - CHANNEL_MID) * amount + CHANNEL_MID),
  brightness: (rgb: Channels, amount: number) => rgb.map((value) => value * amount),
};
type FilterStep = keyof typeof FILTER_STEPS;
const FILTER_STEP_NAMES = Object.keys(FILTER_STEPS);

function isFilterStep(name: string): name is FilterStep {
  return FILTER_STEP_NAMES.includes(name);
}

// A filter this module cannot paint fails loudly rather than leaving a tile in full color.
function filterSteps(filter: string) {
  return filter
    .trim()
    .split(/\s+/)
    .map((part) => {
      const [, name = '', amount = ''] = FILTER_FUNCTION.exec(part) ?? [];
      if (!isFilterStep(name)) throw new Error(`A tile filter cannot be painted: ${part}`);
      return { step: FILTER_STEPS[name], amount: Number(amount) };
    });
}

function clampChannel(value: number) {
  return Math.min(CHANNEL_MAX, Math.max(0, value));
}

function painter(filter: string) {
  const steps = filterSteps(filter);
  return (hex: string) => {
    const painted = steps.reduce(
      (rgb, { step, amount }) => step(rgb, amount).map(clampChannel),
      channels(hex)
    );
    return `#${painted.map(hexByte).join('')}`;
  };
}

export function filteredMarkup(markup: string, filter: string): string {
  return markup.replace(MARKUP_HEX_COLOR, painter(filter));
}

const badges = css.create({
  painted: (fill: string, text: string) => ({ backgroundColor: fill, color: text }),
});

// The filter a tile's icon paints, the AI Image Button badge's face under it, and the flat badge's
// paper ring. The tile itself carries no filter on the native apps.
export function paintedTile(
  filter: string | undefined,
  { brandSolid, paper }: Pick<DrawingTheme, 'brandSolid' | 'paper'>
) {
  if (!filter) return { filter, badge: null, ring: paper };
  const paint = painter(filter);
  return {
    filter,
    badge: badges.painted(paint(brandSolid), paint(DRAWING_ON_BRAND)),
    ring: paint(paper),
  };
}
