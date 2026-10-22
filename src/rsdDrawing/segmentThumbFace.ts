import { StyleSheet } from 'react-native';
import { css } from 'react-strict-dom';
import { colors, dimensions, shadows } from './tokens.css';

// Past --duration-base so the travel reads as a glide between cells rather than a jump, and inside
// a toddler's second tap.
export const THUMB_TRAVEL_MS = 220;
// --ease-glide: on Android and iOS the thumb travels in Reanimated, which cannot read a style token.
export const EASE_GLIDE = [0.22, 1, 0.36, 1] as const;

export type Cell = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

// stacked: the options run down the track, so the thumb travels vertically across its full width.
export type SegmentThumbProps = { cell: Cell; index: number; stacked: boolean };

export const thumbLayout = StyleSheet.create({
  frame: { position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none' },
  stackedFrame: { position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' },
  physicalLeftLtr: { left: 0 },
  physicalLeftSwapped: { right: 0 },
});

// onLayout reports a cell's physical frame and translateX moves physically, so the thumb starts at
// the track's physical left. Where React Native swaps left and right in RTL, `left` is the start
// edge, so the physical left is `right`. react-native-web reports no swap and keeps `left`.
export function thumbOrigin(i18n: { isRTL: boolean; doLeftAndRightSwapInRTL?: boolean }) {
  return i18n.isRTL && i18n.doLeftAndRightSwapInRTL === true
    ? thumbLayout.physicalLeftSwapped
    : thumbLayout.physicalLeftLtr;
}

export const thumbStyles = css.create({
  face: {
    flexGrow: 1,
    marginBlock: dimensions.space1,
    borderRadius: dimensions.radiusSm,
    backgroundColor: colors.brandSolid,
    boxShadow: shadows.shadowControl,
  },
  // Inset from the track's sides as the row's face is from its top and bottom.
  stackedFace: { marginBlock: 0, marginInline: dimensions.space1 },
});
