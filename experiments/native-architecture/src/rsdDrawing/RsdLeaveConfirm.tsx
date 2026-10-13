import { useLeaveConfirm } from '../platform/BrowserBack';
import { LEAVE_CONFIRM_COPY } from '../product/systemBack';
import { ModalShell } from './ModalShell';
import { RsdButton } from './RsdButton';
import { RsdConfirmCard } from './RsdConfirmCard';
import { useModalPresence } from './useModalPresence';

// The shipping LeaveConfirm.svelte card: no close control, since its two choices are the way out,
// and Keep drawing comes first so a stray press or switch-access activation stays.
export function RsdLeaveConfirm() {
  const { open, stay, leave } = useLeaveConfirm();
  const presence = useModalPresence(open || null);
  if (!presence.shown) return null;
  const closing = !presence.visible;
  const choose = (choice: () => void) => () => {
    if (!closing) choice();
  };
  return (
    <ModalShell
      visible={presence.visible}
      onDismiss={presence.dismissed}
      label={LEAVE_CONFIRM_COPY.title}
      size="confirm"
      onClose={stay}
      header={null}
    >
      <RsdConfirmCard
        title={LEAVE_CONFIRM_COPY.title}
        copy={LEAVE_CONFIRM_COPY.body}
        actions={[
          <RsdButton key="stay" variant="brand" size="lg" disabled={closing} onPress={choose(stay)}>
            {LEAVE_CONFIRM_COPY.stay}
          </RsdButton>,
          <RsdButton key="leave" size="lg" disabled={closing} onPress={choose(leave)}>
            {LEAVE_CONFIRM_COPY.leave}
          </RsdButton>,
        ]}
      />
    </ModalShell>
  );
}
