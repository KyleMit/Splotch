import type { PluginListenerHandle } from '@capacitor/core';
import { canvasState } from '$lib/state/canvas.svelte';
import { leaveApp, leaveConfirmModal, loadSystemBackPlugin } from '$lib/state/leaveConfirm';
import { respondToDialogBack } from './dialogBack';

export { default as LeaveConfirm } from '$lib/components/LeaveConfirm.svelte';

/**
 * What one system Back did:
 * - `closed-dialog`: the top dialog closed through its own close path.
 * - `kept-dialog`: the top dialog refused, because it is mid-close or its dismissal is blocked.
 * - `waited`: a dialog was asked for but has not reached the screen yet.
 * - `left`: nothing was open and the canvas was empty, so the app moved to the background.
 * - `confirming`: nothing was open and the canvas had ink, so the Leave Splotch dialog opened.
 */
export type SystemBackResponse = 'closed-dialog' | 'kept-dialog' | 'waited' | 'left' | 'confirming';

export function respondToSystemBack(): SystemBackResponse {
  const dialogResponse = respondToDialogBack();
  if (dialogResponse !== 'no-dialog') return dialogResponse;
  if (canvasState.canvasEmpty) {
    leaveApp().catch((err) => console.error('SystemBack.moveToBackground failed', err));
    return 'left';
  }
  leaveConfirmModal.show(null);
  return 'confirming';
}

// Subscribe to Android system Back. Returns a cleanup that detaches the listener; safe to call
// before the async subscription resolves.
export function listenForSystemBack(): () => void {
  let handle: PluginListenerHandle | undefined;
  let removed = false;

  loadSystemBackPlugin()
    .then(({ SystemBack }) =>
      SystemBack.addListener('back', () => {
        respondToSystemBack();
      })
    )
    .then((h) => {
      if (removed) void h.remove();
      else handle = h;
    })
    .catch((err) => console.error('SystemBack.addListener failed', err));

  return () => {
    removed = true;
    void handle?.remove();
  };
}
