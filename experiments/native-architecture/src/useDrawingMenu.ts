import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { useDrawingScreen } from './useDrawingScreen';
import type { ModalDismissal } from './product/useProductModalRoute';

export function useDrawingMenu(
  screen: ReturnType<typeof useDrawingScreen>,
  dismissal: ModalDismissal
) {
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const lease = useRef<(() => void) | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  const dismissed = useCallback(() => {
    lease.current?.();
    lease.current = null;
    const action = pendingAction.current;
    pendingAction.current = null;
    setPhase('closed');
    action?.();
  }, []);
  useEffect(
    () => () => {
      lease.current?.();
      pendingAction.current = null;
    },
    []
  );
  useEffect(() => {
    // Android Modal has no dismissal callback; its hidden render commits before the handoff.
    if (phase === 'closing' && dismissal === 'platform' && Platform.OS === 'android') dismissed();
  }, [phase, dismissed, dismissal]);
  function close() {
    setPhase('closing');
  }
  return {
    open: phase !== 'closed',
    visible: phase === 'open',
    close,
    dismissed,
    run(action: () => void) {
      pendingAction.current = action;
      close();
    },
    show() {
      if (screen.disabled || screen.drawing || lease.current || phase !== 'closed') return;
      try {
        if (!screen.surface.current) throw new Error('The drawing paper is not ready.');
        lease.current = screen.surface.current.lockInput();
        setPhase('open');
      } catch (error) {
        screen.report(error);
      }
    },
  };
}
