import { html } from 'react-strict-dom';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { RsdAction, styles } from './controls';

export type SurfaceFailureProps = {
  visible: boolean;
  label: string;
  message: string;
  onClose: () => void;
  onDismiss: () => void;
  onRetry: () => void;
};

export function RsdSurfaceFailure({
  visible,
  label,
  message,
  onClose,
  onDismiss,
  onRetry,
}: SurfaceFailureProps) {
  return (
    <ModalShell
      visible={visible}
      label={label}
      size="confirm"
      onClose={onClose}
      onDismiss={onDismiss}
      header={<DialogHeader title={label} titleSize="xl" onClose={onClose} />}
    >
      <html.div style={styles.dialogContent}>
        <html.span aria-live="polite">{message}</html.span>
        <RsdAction label="Try again" onClick={onRetry} />
      </html.div>
    </ModalShell>
  );
}
