import { LEAVE_CONFIRM_COPY } from '../product/systemBack';
import { ModalShell } from './ModalShell';
import { RsdButton } from './RsdButton';
import { RsdConfirmCard } from './RsdConfirmCard';

// The shipping LeaveConfirm.svelte card: no close control, since its two choices are the way out,
// and Keep drawing comes first so a stray press or switch-access activation stays.
export function RsdLeaveConfirmCard({
  visible,
  onDismiss,
  stay,
  leave,
}: {
  visible: boolean;
  onDismiss: () => void;
  stay: () => void;
  leave: () => void;
}) {
  const closing = !visible;
  const choose = (choice: () => void) => () => {
    if (!closing) choice();
  };
  return (
    <ModalShell
      visible={visible}
      onDismiss={onDismiss}
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
