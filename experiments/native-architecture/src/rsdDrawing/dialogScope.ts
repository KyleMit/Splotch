import { createContext, useContext } from 'react';
import type { ModalFrame } from './modalGeometry';

type DialogScopeValue = {
  titleId: string;
  header: ModalFrame['header'];
  body: ModalFrame['body'];
  active: boolean;
  seeThrough: boolean;
};

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

// The card's body inset, for a dialog that lays out its own scrollers instead of the card's.
export function useDialogBody() {
  return useContext(DialogScope)?.body;
}

// True while the dialog melts away to one control so the screen behind shows through it, as
// shipping's Settings does while Button Size is dragged. Its chrome hides itself and a setting
// card stays only when it holds that control.
export function useDialogSeeThrough() {
  return useContext(DialogScope)?.seeThrough ?? false;
}
