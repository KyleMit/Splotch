import {
  createElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { createLazyExport } from '../lazyExport';
import { deferredIconsSettled } from './iconRegistry';
import { scheduleInteractionIdle } from '../../../../web/src/lib/idle';
import { drawingPaint } from '../product/drawingPaint';

function createSurfaceWarmup() {
  let pending = Promise.resolve();
  return (load: () => Promise<unknown>) => {
    pending = pending
      .then(() => drawingPaint.painted())
      .then(
        () =>
          new Promise<void>((resolve) => {
            scheduleInteractionIdle(() => {
              void load()
                .catch(() => {})
                .then(() => resolve());
            });
          })
      );
  };
}

const warmSurface = createSurfaceWarmup();

// A surface prewarmed after paint in its own interaction-quiet slice. Demand bypasses the queue.
// The service worker precaches every chunk, so a
// surface still opens offline once the worker has installed. Before then a load can fail: it throws
// to the RsdSurfaceBoundary around it, and since a failed load is forgotten (lazyExport.ts), the
// boundary's Try again loads the chunk afresh. React.lazy is not used because it keeps a rejected
// load for good. The surface also waits for the deferred icons (iconRegistry.ts), fetched
// alongside its own chunk, so it never opens with an icon box still empty.
export function lazySurface<P extends object>(load: () => Promise<ComponentType<P>>) {
  const surface = createLazyExport(() =>
    Promise.all([load(), deferredIconsSettled()]).then(([loaded]) => loaded)
  );
  warmSurface(surface.load);
  return function LazySurface(props: P) {
    const Loaded = useSyncExternalStore(surface.subscribe, surface.current, surface.current);
    const [failure, setFailure] = useState<{ error: unknown } | null>(null);
    useEffect(() => {
      if (Loaded) return;
      let mounted = true;
      surface.load().catch((error: unknown) => {
        if (mounted) setFailure({ error });
      });
      return () => {
        mounted = false;
      };
    }, [Loaded]);
    if (failure) throw failure.error;
    return Loaded ? createElement(Loaded, props) : null;
  };
}
