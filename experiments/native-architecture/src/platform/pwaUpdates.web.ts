import { createPWAUpdates } from '../../../../web/src/lib/pwa/updates';
import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';
import { SETTLED_IN_STROKES } from '../install/installPolicy';
import type { PwaDrawingState } from './pwaDrawingState';

export function createWebPWAUpdates(current: () => PwaDrawingState) {
  const updates = createPWAUpdates({
    canvasEmpty: () => current().canvasEmpty,
    isDevelopment: () => __DEV__,
    appVersion: FEEDBACK_APP_VERSION,
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
