import { createElement, useState, type ComponentProps } from 'react';
import { createLazyExport, useLazyValue } from '../lazyExport';
import type { RsdPolaroidFlight as Flight } from './RsdPolaroidFlight';

const flight = createLazyExport(() =>
  import('./RsdPolaroidFlight').then((module) => module.RsdPolaroidFlight)
);
const whole = (loaded: typeof Flight) => loaded;

// The flight is decoration on a save that is already under way, so it is never part of first
// paint: its chunk loads with the first save, and a failed load is logged and leaves the flight out,
// as shipping logs a save module that fails to load. Once loaded it stays mounted, so a later
// flight starts on the frame its picture is captured.
export function RsdPolaroidFlight(props: ComponentProps<typeof Flight>) {
  const [wanted, setWanted] = useState(false);
  if (!wanted && props.flight !== null) setWanted(true);
  const Loaded = useLazyValue(flight, wanted ? whole : undefined, 'The save polaroid');
  return Loaded ? createElement(Loaded, props) : null;
}
