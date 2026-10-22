export const FLYOUT_ENTER_MS = 300;
export const FLYOUT_ENTER_POSE_KEYFRAMES = [
  { at: 0, scale: 0.9, offsetPx: 6, easing: [0.16, 1, 0.3, 1] },
  { at: 0.72, scale: 1.022, offsetPx: 0, easing: [0.33, 1, 0.68, 1] },
  { at: 1, scale: 1, offsetPx: 0, easing: [0, 0, 1, 1] },
] as const;
export const FLYOUT_ENTER_FADE_KEYFRAMES = [
  { at: 0, opacity: 0, easing: [0.16, 1, 0.3, 1] },
  { at: 0.52, opacity: 1, easing: [0, 0, 1, 1] },
  { at: 1, opacity: 1, easing: [0, 0, 1, 1] },
] as const;

export const FLYOUT_OPTION_ENTER_MS = 260;
export const FLYOUT_OPTION_DELAY_MS = 40;
export const FLYOUT_OPTION_STAGGER_MS = 25;
export const FLYOUT_OPTION_KEYFRAMES = [
  { at: 0, y: 11, rotate: -5, opacity: 0, easing: [0.16, 1, 0.3, 1] },
  { at: 0.58, y: -2, rotate: 1.6, opacity: 1, easing: [0.45, 0, 0.55, 1] },
  { at: 0.82, y: 0.5, rotate: -0.6, opacity: 1, easing: [0.33, 1, 0.68, 1] },
  { at: 1, y: 0, rotate: 0, opacity: 1, easing: [0, 0, 1, 1] },
] as const;
