import { createContext, useContext } from 'react';
import type { ModalFrame } from './modalGeometry';

type DialogScopeValue = { titleId: string; header: ModalFrame['header']; active: boolean };

export const DialogScope = createContext<DialogScopeValue | null>(null);

// The id ModalShell labels its dialog by: the header title takes it, and a dialog whose title
// sits in its body gives it to that heading.
export function useDialogTitleId() {
  return useContext(DialogScope)?.titleId;
}

// False while the dialog plays its exit: the card is still on screen, but nothing on it may act.
// Outside a dialog every control is active.
export function useDialogActive() {
  return useContext(DialogScope)?.active ?? true;
}
