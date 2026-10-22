import { useEffect, useState } from 'react';
import { useWindowDimensions } from './windowDimensions';
import { getOrientationAsync, Orientation } from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CUTOUT_LEFT_ANGLE, CUTOUT_RIGHT_ANGLE } from '../lib/platform/notchBand';

// screen.orientation.angle, the rotation shipping's band rule reads, for each display rotation
// expo-screen-orientation reports on a portrait phone. It names Android's ROTATION_90 (and iOS's
// landscapeRight), which turns the top edge and its cutout to the left, LANDSCAPE_RIGHT.
const ORIENTATION_ANGLES: Record<Orientation, number> = {
  [Orientation.UNKNOWN]: 0,
  [Orientation.PORTRAIT_UP]: 0,
  [Orientation.PORTRAIT_DOWN]: 180,
  [Orientation.LANDSCAPE_RIGHT]: CUTOUT_LEFT_ANGLE,
  [Orientation.LANDSCAPE_LEFT]: CUTOUT_RIGHT_ANGLE,
};

// Asked again whenever the window or its side insets change: a flip between the two landscapes
// keeps the window's size but moves the cutout's inset to the other side. Until the first answer
// the angle names no side, so an asymmetric landscape pair stays unpainted, as shipping's rule
// leaves it without a Screen Orientation answer.
export function useOrientationAngle(): number {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [angle, setAngle] = useState(0);
  const layout = `${window.width}x${window.height} ${insets.left}/${insets.right}`;
  useEffect(() => {
    let current = true;
    getOrientationAsync().then(
      (orientation) => {
        if (current) setAngle(ORIENTATION_ANGLES[orientation]);
      },
      () => {}
    );
    return () => {
      current = false;
    };
  }, [layout]);
  return angle;
}

// The theme-color tag tints only a browser's chrome; the native status bar takes its icon style.
export function setThemeColor(_color: string) {}
