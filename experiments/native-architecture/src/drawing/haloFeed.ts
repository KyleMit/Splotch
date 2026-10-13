import type { Halo } from './haloModel';

// The live halos the contact responder publishes on every contact update. The halo layer
// subscribes directly, so following a finger never needs a render of the drawing surface.
export type HaloFeed = Readonly<{
  publish: (halos: readonly Halo[]) => void;
  current: () => readonly Halo[];
  subscribe: (listener: () => void) => () => void;
}>;

const NO_HALOS: readonly Halo[] = [];

export function createHaloFeed(): HaloFeed {
  let halos = NO_HALOS;
  const listeners = new Set<() => void>();
  return {
    publish(next) {
      if (next.length === 0 && halos.length === 0) return;
      halos = next.length === 0 ? NO_HALOS : next;
      for (const listener of listeners) listener();
    },
    current: () => halos,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
