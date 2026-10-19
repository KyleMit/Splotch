import { useEffect } from 'react';
import { AppState, Platform, StatusBar } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { css, html } from 'react-strict-dom';
import {
  computeNotchBandState,
  type NotchBandState,
} from '../../../../web/src/lib/platform/notchBand';
import type { Platform as ShippingPlatform } from '../../../../web/src/lib/platform/platformName';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { setThemeColor, useOrientationAngle } from '../platform/notchBandPlatform';
import { motion } from './tokens.css';

// The shipping NotchBand.svelte strips. The fill eases on the web alone, as shipping's CSS does;
// a native color change lands at once.
const styles = css.create({
  edge: {
    position: 'absolute',
    pointerEvents: 'none',
    transitionProperty: 'background-color',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  top: (height: number, backgroundColor: string) => ({
    top: 0,
    left: 0,
    right: 0,
    height,
    backgroundColor,
  }),
  left: (width: number, backgroundColor: string) => ({
    top: 0,
    bottom: 0,
    left: 0,
    width,
    backgroundColor,
  }),
  right: (width: number, backgroundColor: string) => ({
    top: 0,
    bottom: 0,
    right: 0,
    width,
    backgroundColor,
  }),
});

function shippingPlatform(): ShippingPlatform {
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
}

// The status bar follows the band only where shipping's SystemBars call does: icons that read on a
// painted cutout, and Android's landscape bar hidden for the long top edge.
function BandStatusBar({ band }: { band: NotchBandState }) {
  const style =
    band.statusBarStyle === null
      ? undefined
      : band.statusBarStyle === 'DARK'
        ? 'light-content'
        : 'dark-content';
  const hidden = band.statusBarHidden;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (style !== undefined) StatusBar.setBarStyle(style);
      if (hidden !== null) StatusBar.setHidden(hidden);
    });
    return () => subscription.remove();
  }, [style, hidden]);
  if (band.statusBarStyle === null && band.statusBarHidden !== true) return null;
  return <StatusBar barStyle={style} hidden={hidden === true} />;
}

// Shipping stacks the band (--z-notch) over the Actions Panel and the Flat rail glass, which runs
// out through the insets, and under the Clear Button, whose docked tab overhangs the right inset.
// RN's palette bar carries the rail glass and stacks above the Clear Button, so no single layer sits
// where --z-notch does. The right strip, the side the Clear Button docks to, paints just under the
// clear overlay (NativeDrawingLayout); the rest of the band paints over the whole drawing screen
// (NativeFrame). No rail glass reaches the right inset while that strip is painted: the band paints
// the sides only in landscape, where the palette runs down the left edge or gives way altogether.
export type NotchBandLayer = 'cover' | 'dockSide';

// The Notch Band: the drawing color (the paper's, while erasing) in the safe-area strip a display
// cutout sits in, so the hole-punch reads as part of the drawing. Each layer is mounted in a box
// that spans the whole window; the cover layer also owns the status bar and theme color the band
// sets.
export function RsdNotchBand({
  ink,
  eraser,
  layer,
}: {
  ink: string;
  eraser: boolean;
  layer: NotchBandLayer;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { paper } = useDrawingTheme();
  const angle = useOrientationAngle();
  const band = computeNotchBandState({
    platform: shippingPlatform(),
    native: Platform.OS !== 'web',
    orientation: window.width > window.height ? 'landscape' : 'portrait',
    insetTop: insets.top,
    insetLeft: insets.left,
    insetRight: insets.right,
    orientationAngle: angle,
    activeColor: ink,
    eraser,
    paperColor: paper,
  });
  const fills = band.backgroundColors;
  const cover = layer === 'cover';
  useEffect(() => {
    if (cover) setThemeColor(band.themeColor);
  }, [cover, band.themeColor]);
  return cover ? (
    <>
      <html.div aria-hidden style={[styles.edge, styles.top(insets.top, fills.top)]} />
      <html.div aria-hidden style={[styles.edge, styles.left(insets.left, fills.left)]} />
      <BandStatusBar band={band} />
    </>
  ) : (
    <html.div aria-hidden style={[styles.edge, styles.right(insets.right, fills.right)]} />
  );
}
