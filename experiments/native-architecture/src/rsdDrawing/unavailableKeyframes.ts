// app.css's .action-unavailable cue for Undo at the end of history: a shake whose swings shrink,
// and a brand flash whose glow outlasts it; Reduce Motion keeps the flash alone.
// tools/tests/native-unavailable-cue.test.mjs reads both @keyframes rules back and fails on
// divergence.
const EASE_IN_OUT = [0.42, 0, 0.58, 1] as const;
const LINEAR = [0, 0, 1, 1] as const;

export const UNAVAILABLE_SHAKE_MS = 460;
export const UNAVAILABLE_SHAKE_KEYFRAMES = [
  { at: 0, x: 0, rotate: 0, easing: EASE_IN_OUT },
  { at: 0.14, x: -5, rotate: -3.2, easing: EASE_IN_OUT },
  { at: 0.32, x: 5, rotate: 3.2, easing: EASE_IN_OUT },
  { at: 0.52, x: -3, rotate: -1.8, easing: EASE_IN_OUT },
  { at: 0.7, x: 2, rotate: 1, easing: EASE_IN_OUT },
  { at: 0.86, x: -0.8, rotate: -0.4, easing: EASE_IN_OUT },
  { at: 1, x: 0, rotate: 0, easing: LINEAR },
] as const;

// `lit` is the share of the brand-washed, fully opaque tile over the resting one; the glow ring
// spreads from GLOW_SPREAD_PX to GLOW_FADE_SPREAD_PX while it fades.
export const UNAVAILABLE_FLASH_MS = 520;
export const UNAVAILABLE_GLOW_SPREAD_PX = 10;
export const UNAVAILABLE_GLOW_FADE_SPREAD_PX = 16;
export const UNAVAILABLE_GLOW_BRAND_SHARE = 0.42;
export const UNAVAILABLE_FLASH_KEYFRAMES = [
  { at: 0, lit: 0, glow: 0, spreadPx: UNAVAILABLE_GLOW_SPREAD_PX, easing: EASE_IN_OUT },
  { at: 0.12, lit: 1, glow: 1, spreadPx: UNAVAILABLE_GLOW_SPREAD_PX, easing: EASE_IN_OUT },
  { at: 0.62, lit: 1, glow: 1, spreadPx: UNAVAILABLE_GLOW_SPREAD_PX, easing: EASE_IN_OUT },
  { at: 1, lit: 0, glow: 0, spreadPx: UNAVAILABLE_GLOW_FADE_SPREAD_PX, easing: LINEAR },
] as const;
