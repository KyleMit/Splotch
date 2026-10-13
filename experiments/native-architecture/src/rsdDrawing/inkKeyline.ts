import type { InkKeyline } from './RsdIconButton';

// The shipping colors.svelte.ts keyline rules: exactly white ink takes the black ring, and ink
// darker than this WCAG relative luminance takes the dark-mode ring.
// rsd-native-actions-panel.test.mjs holds both to the shipping source.
export const WHITE_INK_HEX = '#ffffff';
export const DARK_INK_RELATIVE_LUMINANCE_MAX = 0.14;

const HEX_CHANNELS = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const SRGB_LINEAR_KNEE = 0.04045;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
const CHANNEL_MAX = 255;

function linear(channel: number) {
  const value = channel / CHANNEL_MAX;
  return value <= SRGB_LINEAR_KNEE
    ? value / SRGB_LINEAR_SLOPE
    : ((value + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

function relativeLuminance(hex: string): number | null {
  const channels = HEX_CHANNELS.exec(hex.trim());
  if (!channels) return null;
  return LUMINANCE_WEIGHTS.reduce(
    (sum, weight, index) => sum + weight * linear(Number.parseInt(channels[index + 1], 16)),
    0
  );
}

export function inkKeyline(hex: string): InkKeyline | undefined {
  if (hex.trim().toLowerCase() === WHITE_INK_HEX) return 'white';
  const luminance = relativeLuminance(hex);
  return luminance !== null && luminance < DARK_INK_RELATIVE_LUMINANCE_MAX ? 'dark' : undefined;
}
