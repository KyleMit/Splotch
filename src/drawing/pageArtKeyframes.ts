export const PAGE_ART_ENTER_MS = 350;
export const PAGE_ART_CALM_MS = 200;
export const PAGE_ART_CALM_EASE = [0.25, 0.1, 0.25, 1] as const;
const PAGE_ART_GLIDE = [0.22, 1, 0.36, 1] as const;
const PAGE_ART_ENTER_SCALE = 1.025;
export const PAGE_ART_FADE_KEYFRAMES = [
  { at: 0, opacity: 0, easing: PAGE_ART_GLIDE },
  { at: 0.55, opacity: 1, easing: PAGE_ART_GLIDE },
  { at: 1, opacity: 1, easing: PAGE_ART_GLIDE },
] as const;
export const PAGE_ART_SCALE_KEYFRAMES = [
  { at: 0, scale: PAGE_ART_ENTER_SCALE, easing: PAGE_ART_GLIDE },
  { at: 1, scale: 1, easing: PAGE_ART_GLIDE },
] as const;
