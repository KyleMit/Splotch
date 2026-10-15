import { useEffect, useLayoutEffect, useState } from 'react';
import { scheduleInteractionIdle } from '../../../../web/src/lib/idle';
import { drawingPaint } from '../product/drawingPaint';
import type { PwaDrawingState } from './pwaDrawingState';
import type { createWebPWAUpdates } from './pwaUpdates.web';

export function createPWAServiceWorker() {
  let state: PwaDrawingState = { canvasEmpty: false, strokes: 0 };
  let owner: ReturnType<typeof createWebPWAUpdates> | null = null;
  let pending: Promise<void> | null = null;
  let generation = 0;
  let cancelIdle = () => {};
  return {
    start(): Promise<void> {
      if (__DEV__ || !('serviceWorker' in navigator)) return Promise.resolve();
      const current = generation;
      pending ??= drawingPaint
        .painted()
        .then(async () => {
          if (current !== generation) return;
          await new Promise<void>((resolve) => {
            cancelIdle = scheduleInteractionIdle(resolve);
          });
          if (current !== generation) return;
          const module = await import('./pwaUpdates.web');
          if (current !== generation) return;
          owner = module.createWebPWAUpdates(() => state);
          owner.start();
        })
        .catch((error: unknown) => {
          if (current !== generation) return;
          pending = null;
          console.warn('Offline support is unavailable.', error);
        });
      return pending;
    },
    update(next: PwaDrawingState) {
      state = next;
      owner?.update();
    },
    stop() {
      generation += 1;
      cancelIdle();
      owner?.stop();
      owner = null;
      pending = null;
    },
  };
}

export function usePWAUpdates({ canvasEmpty, strokes }: PwaDrawingState) {
  const [serviceWorker] = useState(createPWAServiceWorker);
  useLayoutEffect(() => {
    serviceWorker.update({ canvasEmpty, strokes });
  }, [serviceWorker, canvasEmpty, strokes]);
  useEffect(() => {
    void serviceWorker.start();
    return () => serviceWorker.stop();
  }, [serviceWorker]);
}
