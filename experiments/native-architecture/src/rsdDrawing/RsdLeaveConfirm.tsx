import { html } from 'react-strict-dom';
import { useLeaveConfirm } from '../platform/BrowserBack';
import { LEAVE_CONFIRM_COPY } from '../product/systemBack';
import { NativeDialog } from './NativeDialog';
import { RsdAction, styles } from './controls';

export function RsdLeaveConfirm() {
  const { open, stay, leave } = useLeaveConfirm();
  if (!open) return null;
  // Keep drawing comes first so a stray press or switch-access activation stays.
  return (
    <NativeDialog
      visible
      label={LEAVE_CONFIRM_COPY.title}
      onClose={stay}
      footer={
        <html.div style={styles.row}>
          <RsdAction label={LEAVE_CONFIRM_COPY.stay} onClick={stay} />
          <RsdAction label={LEAVE_CONFIRM_COPY.leave} onClick={leave} />
        </html.div>
      }
    >
      <html.div style={styles.dialogContent}>
        <html.h1 style={styles.boldText}>{LEAVE_CONFIRM_COPY.title}</html.h1>
        <html.p>{LEAVE_CONFIRM_COPY.body}</html.p>
      </html.div>
    </NativeDialog>
  );
}
