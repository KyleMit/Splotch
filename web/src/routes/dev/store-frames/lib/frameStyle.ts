// The frame design tokens (from the 2026-08 design handoff): copy ink, page
// gradients, frame shadow/radius, and the per-orientation type and chip
// scales. All lengths are base-space px (see geometry.ts), multiplied by each
// slot's k at render time.

import type { StoreOrientation } from './targets.ts';

export const INK = '#453d63';
export const INK_MUTED = '#6b6284';
export const INK_ON_DARK = '#eceaf2';
export const INK_MUTED_ON_DARK = '#cfccdb';
export const LIGHT_BG = 'linear-gradient(165deg, #fbfaff 0%, #f4eefc 48%, #ebe1f8 100%)';
export const DARK_BG = 'linear-gradient(165deg, #221e31 0%, #191624 55%, #141120 100%)';
export const POLAROID_PAPER = '#fdfcf7';
export const POLAROID_CAPTION_COLOR = '#7c50bb';

interface ShadowSpec {
  y: number;
  blur: number;
  color: string;
}

// The dark parent-trust page swaps the purple-tinted frame shadow for a plain
// black one — a purple glow reads as a smudge on the dark gradient.
export const FRAME_SHADOW_SPEC: Record<StoreOrientation, Record<'light' | 'dark', ShadowSpec>> = {
  landscape: {
    light: { y: 30, blur: 80, color: 'rgba(60,40,110,.28)' },
    dark: { y: 33, blur: 88, color: 'rgba(0,0,0,.55)' },
  },
  portrait: {
    light: { y: 33.5, blur: 75.4, color: 'rgba(60,40,110,.30)' },
    dark: { y: 36.8, blur: 80.4, color: 'rgba(0,0,0,.55)' },
  },
};

export const FRAME_RADIUS: Record<StoreOrientation, number> = { landscape: 24, portrait: 28.5 };

// Typography differs by orientation: the centered portrait copy zone carries
// larger type than the landscape column.
export interface TypeSpec {
  headline: number;
  headlineLineHeight: number;
  letterSpacing: number;
  sub: number;
  subLineHeight: number;
  subMarginTop: number;
  logoIcon: number;
  logoRadius: number;
  logoText: number;
  logoGap: number;
  logoMarginBottom: number;
}

export const TYPE_SPEC: Record<StoreOrientation, TypeSpec> = {
  landscape: {
    headline: 78,
    headlineLineHeight: 1.06,
    letterSpacing: -1,
    sub: 33,
    subLineHeight: 1.38,
    subMarginTop: 22,
    logoIcon: 64,
    logoRadius: 15,
    logoText: 44,
    logoGap: 16,
    logoMarginBottom: 26,
  },
  portrait: {
    headline: 80.4,
    headlineLineHeight: 1.08,
    letterSpacing: -1.26,
    sub: 38.5,
    subLineHeight: 1.35,
    subMarginTop: 21.8,
    logoIcon: 77,
    logoRadius: 18.4,
    logoText: 48.6,
    logoGap: 18,
    logoMarginBottom: 26,
  },
};

export const CHIP_SPEC = {
  font: 27.6,
  padY: 13.4,
  padX: 25.1,
  dot: 13.4,
  gap: 13.4,
  labelGap: 10,
  shadowY: 6.7,
  shadowBlur: 20.1,
  marginTop: 30,
};
