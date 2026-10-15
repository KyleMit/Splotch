import type { Bezier } from './keyframeMotion';
// The app.css polaroid flight, keyframe for keyframe. CSS cannot be imported, so
// tools/tests/native-polaroid-flight.test.mjs parses app.css and fails when any keyframe, curve,
// duration or frame literal here diverges from it.

// `from` scales the offset from the screen's center to the Save screenshot button: 1 is over the
// button, 0 the center. `easing` runs from this keyframe to the next, as a keyframe's
// animation-timing-function does.
export type PolaroidKeyframe = Readonly<{
  at: number;
  from: number;
  scale: number;
  rotate: number;
  opacity: number;
  easing: Bezier;
}>;

export type FlashKeyframe = Readonly<{ at: number; opacity: number; easing: Bezier }>;

const LINEAR: Bezier = [0, 0, 1, 1];
const EASE_OUT: Bezier = [0, 0, 0.58, 1];
// The CSS `ease` keyword, which the discarded overlay's fade uses.
export const CSS_EASE: Bezier = [0.25, 0.1, 0.25, 1];

const LAUNCH = { from: 1, scale: 0.12, rotate: -16, opacity: 0 } as const;
const REST = { from: 0, scale: 1, rotate: -4, opacity: 1 } as const;
const GLIDE: Bezier = [0.22, 1, 0.36, 1];
const SWAY: Bezier = [0.45, 0, 0.55, 1];

// @keyframes polaroid-show: out of the button, a wobbling settle at the center, and back in.
export const POLAROID_SHOW_KEYFRAMES: readonly PolaroidKeyframe[] = [
  { at: 0, ...LAUNCH, easing: [0.4, 0, 0.6, 1] },
  { at: 0.07, from: 1.04, scale: 0.14, rotate: -18, opacity: 0.55, easing: [0.16, 1, 0.3, 1] },
  { at: 0.28, from: 0, scale: 1.05, rotate: -6.5, opacity: 1, easing: SWAY },
  { at: 0.36, from: 0, scale: 0.995, rotate: -2.8, opacity: 1, easing: SWAY },
  { at: 0.44, from: 0, scale: 1.008, rotate: -4.6, opacity: 1, easing: [0.33, 1, 0.68, 1] },
  { at: 0.52, ...REST, easing: GLIDE },
  { at: 0.78, ...REST, easing: GLIDE },
  { at: 1, ...LAUNCH, easing: GLIDE },
];

// @keyframes polaroid-fade, the Reduce Motion flight: no travel, a fade in and out at the tilt.
// Its ends are the frame's own resting style, untransformed and transparent.
export const POLAROID_FADE_KEYFRAMES: readonly PolaroidKeyframe[] = [
  { at: 0, from: 0, scale: 1, rotate: 0, opacity: 0, easing: LINEAR },
  { at: 0.15, ...REST, easing: LINEAR },
  { at: 0.7, ...REST, easing: LINEAR },
  { at: 1, from: 0, scale: 1, rotate: 0, opacity: 0, easing: LINEAR },
];
export const POLAROID_FADE_MS = 700;

// @keyframes polaroid-flash under its `ease-out`; Reduce Motion drops it.
export const POLAROID_FLASH_KEYFRAMES: readonly FlashKeyframe[] = [
  { at: 0, opacity: 0, easing: EASE_OUT },
  { at: 0.15, opacity: 0.85, easing: EASE_OUT },
  { at: 1, opacity: 0, easing: EASE_OUT },
];

// The flash runs for --duration-slow, a failed save's fade for --duration-base, and the overlay
// sits at --z-polaroid. Numbers here, since React Native animates and stacks with numbers; the
// test reads each back from web/src/lib/design/tokens.ts, which would otherwise join the web
// startup chunk.
export const FLASH_MS = 350;
export const DISCARD_FADE_MS = 200;
export const POLAROID_Z_INDEX = 1004;

// .polaroid-frame.
export const POLAROID_FRAME = {
  paddingInlinePx: 16,
  paddingTopPx: 16,
  paddingBottomPx: 64,
  radiusPx: 3,
  shadow:
    '0 14px 40px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(0, 0, 0, 0.04)',
} as const;
