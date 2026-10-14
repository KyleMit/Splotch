import { createElement, type ComponentProps } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdNotchBand as Band } from './RsdNotchBand';

const band = createLazyExport(() => import('./RsdNotchBand').then((module) => module.RsdNotchBand));
const whole = (loaded: typeof Band) => loaded;

// The band paints only beside a cutout and tints the browser's theme color, neither of which the
// first frame needs, so shipping's pure band rules stay off the startup path.
export function RsdNotchBand(props: ComponentProps<typeof Band>) {
  const Loaded = useLazyValue(band, whole, 'The Notch Band');
  return Loaded ? createElement(Loaded, props) : null;
}
