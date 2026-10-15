const GLIDE = [0.22, 1, 0.36, 1] as const;
export const SWATCH_BLOOM_MS = 620;
export const SWATCH_BLOOM_TRAIL_MS = 700;
export const SWATCH_BLOOM_TRAIL_DELAY_MS = 90;
export const SWATCH_BLOOM_TRAIL_WIDTH_PX = 3;
export const SWATCH_BLOOM_SCALE_KEYFRAMES = [
  { at: 0, scale: 0.34, easing: GLIDE },
  { at: 1, scale: 1.16, easing: GLIDE },
] as const;
export const SWATCH_BLOOM_FADE_KEYFRAMES = [
  { at: 0, opacity: 0, easing: GLIDE },
  { at: 0.26, opacity: 0.95, easing: GLIDE },
  { at: 1, opacity: 0, easing: GLIDE },
] as const;
export const SWATCH_TRAIL_SCALE_KEYFRAMES = [
  { at: 0, scale: 0.5, easing: GLIDE },
  { at: 1, scale: 1.34, easing: GLIDE },
] as const;
export const SWATCH_TRAIL_FADE_KEYFRAMES = [
  { at: 0, opacity: 0, easing: GLIDE },
  { at: 0.34, opacity: 0.4, easing: GLIDE },
  { at: 1, opacity: 0, easing: GLIDE },
] as const;
