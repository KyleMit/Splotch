import { canvasState } from '$lib/state/canvas.svelte';
import { createPWAUpdates as createSharedPWAUpdates } from './updates';
export { ACTIVATION_RECOVERY_MS, WAITING_SETTLE_MS } from './updates';

/* @__NO_SIDE_EFFECTS__ */
export function createPWAUpdates() {
  return createSharedPWAUpdates({
    canvasEmpty: () => canvasState.canvasEmpty,
    isDevelopment: () => import.meta.env.DEV,
    appVersion: __APP_VERSION__,
  });
}

export const pwaUpdates = createPWAUpdates();
