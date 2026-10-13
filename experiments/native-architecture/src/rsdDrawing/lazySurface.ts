import {
  createElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { createLazyExport } from '../lazyExport';

// A surface loaded from its own chunk on first use. The service worker precaches every chunk, so a
// surface still opens offline once the worker has installed. Before then a load can fail: it throws
// to the RsdSurfaceBoundary around it, and since a failed load is forgotten (lazyExport.ts), the
// boundary's Try again loads the chunk afresh. React.lazy is not used because it keeps a rejected
// load for good.
export function lazySurface<P extends object>(load: () => Promise<ComponentType<P>>) {
  const surface = createLazyExport(load);
  return function LazySurface(props: P) {
    const Loaded = useSyncExternalStore(surface.subscribe, surface.current);
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
