import { createElement, useState, type ComponentProps } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import { installPrompt } from '../platform/installPrompt';
import { useInstallSnapshot } from '../install/useInstallBanner';
import type { RsdInstallBanner as Banner } from './RsdInstallBanner';

const banner = createLazyExport(() =>
  import('./RsdInstallBanner').then((module) => module.RsdInstallBanner)
);
const whole = (loaded: typeof Banner) => loaded;

// The banner waits for settled-in drawing, so it is never part of first paint. Its chunk loads once
// this browser has an install path: from then on the banner counts sessions toward a re-offer, and
// it is ready before the strokes that show it. Once loaded it stays mounted, so an install or a
// dismissal still plays its exit.
export function RsdInstallBanner(props: ComponentProps<typeof Banner>) {
  const snapshot = useInstallSnapshot(installPrompt);
  const [wanted, setWanted] = useState(false);
  if (!wanted && installPrompt !== null && snapshot.mode !== 'none' && !snapshot.installed)
    setWanted(true);
  const Loaded = useLazyValue(banner, wanted ? whole : undefined, 'The Install Banner');
  return Loaded ? createElement(Loaded, props) : null;
}
