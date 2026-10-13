import { html } from 'react-strict-dom';
import { useLeaveConfirm } from '../platform/BrowserBack';
import { LEAVE_CONFIRM_COPY } from '../product/systemBack';
import { ModalShell } from './ModalShell';
import { useDialogTitleId } from './DialogHeader';
import { useModalPresence } from './useModalPresence';
import { RsdAction, styles } from './controls';

export function RsdLeaveConfirm() {
  const { open, stay, leave } = useLeaveConfirm();
  const presence = useModalPresence(open || null);
  if (!presence.shown) return null;
  // The shipping confirmation card has no close control: its two choices are the way out, and
  // Keep drawing comes first so a stray press or switch-access activation stays.
  return (
    <ModalShell
      visible={presence.visible}
      onDismiss={presence.dismissed}
      label={LEAVE_CONFIRM_COPY.title}
      size="confirm"
      onClose={stay}
      header={null}
    >
      <html.div style={styles.dialogContent}>
        <LeaveTitle />
        <html.p>{LEAVE_CONFIRM_COPY.body}</html.p>
        <html.div style={styles.row}>
          <RsdAction label={LEAVE_CONFIRM_COPY.stay} onClick={stay} />
          <RsdAction label={LEAVE_CONFIRM_COPY.leave} onClick={leave} />
        </html.div>
      </html.div>
    </ModalShell>
  );
}

function LeaveTitle() {
  return (
    <html.h1 id={useDialogTitleId()} style={styles.boldText}>
      {LEAVE_CONFIRM_COPY.title}
    </html.h1>
  );
}
