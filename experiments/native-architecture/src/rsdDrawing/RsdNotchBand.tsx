import { useEffect } from 'react';
import { AppState, Platform, StatusBar, useWindowDimensions } from 'react-native';
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

// Shipping stacks the band (--z-notch) over the Flat rail glass, which runs up through the top
// inset, and over the Actions Panel's shadows, but under the Clear Button, whose docked tab
// overhangs a landscape side inset. The rail glass rides in the palette bar, which RN stacks above
// the Clear Button, so the top strip paints over the whole drawing screen (NativeFrame) and the side
// strips paint just under the clear overlay (NativeDrawingLayout).
export type NotchBandLayer = 'top' | 'sides';

// The Notch Band: the drawing color (the paper's, while erasing) in the safe-area strip a display
// cutout sits in, so the hole-punch reads as part of the drawing. Each layer is mounted in a box
// whose edges are the screen's along its strips; the top layer also owns the status bar and theme
// color the band sets.
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
  const top = layer === 'top';
  useEffect(() => {
    if (top) setThemeColor(band.themeColor);
  }, [top, band.themeColor]);
  return top ? (
    <>
      <html.div aria-hidden style={[styles.edge, styles.top(insets.top, fills.top)]} />
      <BandStatusBar band={band} />
    </>
  ) : (
    <>
      <html.div aria-hidden style={[styles.edge, styles.left(insets.left, fills.left)]} />
      <html.div aria-hidden style={[styles.edge, styles.right(insets.right, fills.right)]} />
    </>
  );
}
