import type { PluginListenerHandle } from '@capacitor/core';
import { dismissTopModal } from '$lib/actions/modalDialog.svelte';
import { aiResult } from '$lib/state/aiGeneration.svelte';
import { canvasState } from '$lib/state/canvas.svelte';
import { leaveApp, leaveConfirmModal, loadSystemBackPlugin } from '$lib/state/leaveConfirm';
import { gate } from '$lib/state/parentalGate.svelte';
import {
  aiPromptModal,
  coloringBookModal,
  colorPickerModal,
  settingsModal,
} from '$lib/state/ui.svelte';

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

// Every page-level modal flag. A dialog mounts from the lazy overlay chunk after its flag
// flips, so for a moment a requested dialog is not yet in the top layer that
// dismissTopModal() reads; Back in that moment must not leave or stack a second dialog.
function dialogRequested(): boolean {
  return (
    settingsModal.open ||
    colorPickerModal.open ||
    coloringBookModal.open ||
    aiPromptModal.open ||
    gate.open ||
    (aiResult.open && !aiResult.minimized) ||
    leaveConfirmModal.open
  );
}

export function respondToSystemBack(): SystemBackResponse {
  const dismissal = dismissTopModal();
  if (dismissal === 'dismissed') return 'closed-dialog';
  if (dismissal === 'refused') return 'kept-dialog';
  if (dialogRequested()) return 'waited';
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
