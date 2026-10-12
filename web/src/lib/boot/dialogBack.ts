import { dismissTopModal } from '$lib/actions/modalDialog.svelte';
import { aiGenerationState } from '$lib/state/aiGeneration.svelte';
import { leaveConfirmModal } from '$lib/state/leaveConfirm';
import { parentalGateState } from '$lib/state/parentalGate.svelte';
import {
  aiPromptModal,
  coloringBookModal,
  colorPickerModal,
  settingsModal,
} from '$lib/state/ui.svelte';

export type DialogBackResponse = 'closed-dialog' | 'kept-dialog' | 'waited' | 'no-dialog';

function dialogRequested(): boolean {
  return (
    settingsModal.open ||
    colorPickerModal.open ||
    coloringBookModal.open ||
    aiPromptModal.open ||
    parentalGateState.open ||
    (aiGenerationState.phase.kind !== 'closed' && !aiGenerationState.minimized) ||
    leaveConfirmModal.open
  );
}

export function respondToDialogBack(): DialogBackResponse {
  const dismissal = dismissTopModal();
  if (dismissal === 'dismissed') return 'closed-dialog';
  if (dismissal === 'refused') return 'kept-dialog';
  return dialogRequested() ? 'waited' : 'no-dialog';
}
