import { createElement, useEffect, useSyncExternalStore, type ComponentProps } from 'react';
import { createLazyExport } from '../lazyExport';
import type { FixedInkCapture as Fixed } from './FixedInkCapture';
import type { PictureRequest } from './PictureCapture';

export type { PictureRequest } from './PictureCapture';

const capture = createLazyExport(() => import('./pageArtChunk.web'));

export function PictureCapture({ packet }: { packet: PictureRequest }) {
  const Loaded = useSyncExternalStore(capture.subscribe, capture.current, capture.current);
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
  return Loaded && packet.isCurrent() ? createElement(Loaded.PictureCapture, { packet }) : null;
}

export function FixedInkCapture(props: ComponentProps<typeof Fixed>) {
  const Loaded = useSyncExternalStore(capture.subscribe, capture.current, capture.current);
  const { onError } = props;
  useEffect(() => {
    let mounted = true;
    capture.load().catch((error: unknown) => {
      if (mounted) onError(error);
    });
    return () => {
      mounted = false;
    };
  }, [onError]);
  return Loaded ? createElement(Loaded.FixedInkCapture, props) : null;
}
