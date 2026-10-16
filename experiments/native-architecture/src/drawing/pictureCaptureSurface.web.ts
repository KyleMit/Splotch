import { createElement, useEffect, useSyncExternalStore } from 'react';
import { createLazyExport } from '../lazyExport';
import type { PictureRequest } from './PictureCapture';

export type { PictureRequest } from './PictureCapture';

const capture = createLazyExport(() =>
  import('./pageArtChunk.web').then((module) => module.PictureCapture)
);

export function PictureCapture({ packet }: { packet: PictureRequest }) {
  const Loaded = useSyncExternalStore(capture.subscribe, capture.current);
  useEffect(() => {
    let mounted = true;
    capture.load().catch((error: unknown) => {
      if (mounted)
        packet.request.cancel(error instanceof Error ? error.message : 'PNG capture failed.');
    });
    return () => {
      mounted = false;
      packet.request.cancel('Picture capture was cancelled.');
    };
  }, [packet]);
  return Loaded && packet.isCurrent() ? createElement(Loaded, { packet }) : null;
}
