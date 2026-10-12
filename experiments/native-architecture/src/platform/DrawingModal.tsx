import type { ComponentProps } from 'react';
import { Modal } from 'react-native';
import { useDialogBack } from './BrowserBack';

type DrawingModalProps = Omit<ComponentProps<typeof Modal>, 'onRequestClose'> & {
  onRequestClose: () => void;
};

export function DrawingModal({ onRequestClose, ...props }: DrawingModalProps) {
  useDialogBack(props.visible !== false, onRequestClose);
  return <Modal {...props} onRequestClose={onRequestClose} />;
}
