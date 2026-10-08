import { modalDialog } from '$lib/actions/modalDialog.svelte';
import { buttonCenter, createModal } from '$lib/state/modal.svelte';
import { settingsModal } from '$lib/state/ui.svelte';
import {
  PROBE_DIALOG_OPENER_ID,
  PROBE_DIALOG_CLOSE_ID,
  PROBE_DIALOG_REFUSAL_ID,
  PROBE_DIALOG_SETTINGS_ID,
  type ProbeStore,
} from './probeProps';

function createProbeModalState() {
  const modal = createModal();
  let refuseDismissal = $state(false);
  return {
    modal,
    get refuseDismissal() {
      return refuseDismissal;
    },
    setRefused(value: boolean) {
      refuseDismissal = value;
    },
  };
}

function requiredControl<T extends HTMLElement>(
  dialog: HTMLDialogElement,
  selector: string,
  elementType: new () => T
): T {
  const element = dialog.querySelector(selector);
  if (!(element instanceof elementType))
    throw new Error(`Missing web host dialog control: ${selector}`);
  return element;
}

export function bindProbeModal(
  dialog: HTMLDialogElement,
  inner: HTMLElement
): {
  openDialog: ProbeStore['openDialog'];
  dispose: () => void;
} {
  const close = requiredControl(dialog, `#${PROBE_DIALOG_CLOSE_ID}`, HTMLButtonElement);
  const refusal = requiredControl(dialog, `#${PROBE_DIALOG_REFUSAL_ID}`, HTMLInputElement);
  const settings = requiredControl(dialog, `#${PROBE_DIALOG_SETTINGS_ID}`, HTMLButtonElement);
  const probeModalState = createProbeModalState();
  let disposed = false;
  const requestClose = () => {
    if (!disposed && !probeModalState.refuseDismissal) probeModalState.modal.hide();
  };
  const changeRefusal = () => {
    if (!disposed) probeModalState.setRefused(refusal.checked);
  };
  const openSettings = () => {
    if (!disposed && settings.isConnected) settingsModal.show(buttonCenter(settings));
  };
  const restoreFocus = () => {
    if (disposed || dialog.open || !inner.isConnected || document.querySelector('dialog[open]'))
      return;
    const opener = inner.querySelector<HTMLButtonElement>(`#${PROBE_DIALOG_OPENER_ID}`);
    if (opener?.isConnected) opener.focus();
  };

  close.addEventListener('click', requestClose);
  refusal.addEventListener('change', changeRefusal);
  settings.addEventListener('click', openSettings);
  let stopEffects: (() => void) | undefined;
  let destroyAction: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    close.removeEventListener('click', requestClose);
    refusal.removeEventListener('change', changeRefusal);
    settings.removeEventListener('click', openSettings);
    if (stopEffects) stopEffects();
    else destroyAction?.();
    if (dialog.isConnected && dialog.open) dialog.close();
  };

  try {
    stopEffects = $effect.root(() => {
      const action = modalDialog(dialog, () => ({
        open: probeModalState.modal.open,
        origin: probeModalState.modal.origin,
        onRequestClose: requestClose,
        allowDismiss: () => !probeModalState.refuseDismissal,
        onClose: restoreFocus,
      }));
      destroyAction = action.destroy;
      $effect(() => {
        refusal.checked = probeModalState.refuseDismissal;
        close.disabled = probeModalState.refuseDismissal;
      });
      return action.destroy;
    });
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    openDialog(trigger) {
      if (disposed || !dialog.isConnected || !inner.isConnected || !inner.contains(trigger)) return;
      if (trigger.id !== PROBE_DIALOG_OPENER_ID) throw new Error('Unknown web host dialog opener');
      probeModalState.modal.show(buttonCenter(trigger));
    },
    dispose,
  };
}
