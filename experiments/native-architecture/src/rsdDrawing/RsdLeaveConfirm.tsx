import { useLeaveConfirm } from '../platform/BrowserBack';
import { RsdLeaveConfirmCard } from './drawingSheets';
import { RsdSurfaceBoundary } from './RsdSurfaceBoundary';
import { useModalPresence } from './useModalPresence';

// Leave Splotch? asks only on a Back that would leave ink behind, so its card loads on first use.
export function RsdLeaveConfirm() {
  const { open, stay, leave } = useLeaveConfirm();
  const presence = useModalPresence(open || null);
  if (!presence.shown) return null;
  return (
    <RsdSurfaceBoundary onClose={stay}>
      <RsdLeaveConfirmCard
        visible={presence.visible}
        onDismiss={presence.dismissed}
        stay={stay}
        leave={leave}
      />
    </RsdSurfaceBoundary>
  );
}
