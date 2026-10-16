export const UNDO_SPIN_MS = 470;
export const UNDO_SPIN_KEYFRAMES = [
  { at: 0, rotate: 0, easing: [0.3, 0.8, 0.4, 1] },
  { at: 0.11, rotate: 24, easing: [0.45, 0.02, 0.36, 1] },
  { at: 0.76, rotate: -334, easing: [0.25, 0.7, 0.3, 1] },
  { at: 0.9, rotate: -357, easing: [0, 0, 1, 1] },
  { at: 1, rotate: -360, easing: [0, 0, 1, 1] },
] as const;
