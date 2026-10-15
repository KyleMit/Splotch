import { createPWAUpdates } from '../../../../web/src/lib/pwa/updates';
import { WEB_VERSION_META_SELECTOR } from './webVersion';
import { SETTLED_IN_STROKES } from '../install/installPolicy';
import type { PwaDrawingState } from './pwaDrawingState';

export function createWebPWAUpdates(current: () => PwaDrawingState) {
  const appVersion = document.querySelector<HTMLMetaElement>(WEB_VERSION_META_SELECTOR)?.content;
  if (!appVersion) throw new Error('The web build has no app version.');
  const updates = createPWAUpdates({
    canvasEmpty: () => current().canvasEmpty,
    isDevelopment: () => __DEV__,
    appVersion,
  });
  let pending = false;
  let retryAfterStroke: number | null = null;
  let stop = () => {};
  function update() {
    const { strokes } = current();
    if (
      pending ||
      strokes < SETTLED_IN_STROKES ||
      (retryAfterStroke !== null && strokes <= retryAfterStroke)
    )
      return;
    pending = true;
    void updates
      .registerDeferredServiceWorker()
      .then((registered) => {
        if (!registered) retryAfterStroke = current().strokes;
      })
      .finally(() => {
        pending = false;
      });
  }
  return {
    start() {
      stop = updates.initPWAUpdates() ?? (() => {});
      update();
    },
    stop() {
      stop();
      stop = () => {};
    },
    update,
  };
}
