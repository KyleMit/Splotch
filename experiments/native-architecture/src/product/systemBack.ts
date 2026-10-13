export const LEAVE_CONFIRM_COPY = {
  title: 'Leave Splotch?',
  body: 'This drawing stays while Splotch is in the background. It is lost if Splotch closes.',
  stay: 'Keep drawing',
  leave: 'Leave',
} as const;

export interface SystemBackPort {
  hasInk(): boolean;
  exit(): void;
}

// The policy of ADR-0165: Back closes the top dialog, leaves an empty canvas at once, and asks
// before leaving ink. Back on the question is its cancel, so repeated Back never leaves. A stroke
// still under a finger is ink: it commits only when its last contact lifts.
export function createSystemBack(port: SystemBackPort) {
  const dialogs = new Map<number, () => void>();
  const listeners = new Set<() => void>();
  let nextDialog = 0;
  let leaveOpen = false;
  let drawingActive = false;

  function setLeaveOpen(value: boolean) {
    if (leaveOpen === value) return;
    leaveOpen = value;
    for (const listener of listeners) listener();
  }

  function stay() {
    setLeaveOpen(false);
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isLeaveOpen: () => leaveOpen,
    setDrawingActive(active: boolean) {
      drawingActive = active;
    },
    registerDialog(close: () => void) {
      const id = ++nextDialog;
      dialogs.set(id, close);
      return () => {
        dialogs.delete(id);
      };
    },
    respond(): true {
      const top = [...dialogs.values()].at(-1);
      if (top) top();
      else if (leaveOpen) stay();
      else if (drawingActive || port.hasInk()) setLeaveOpen(true);
      else port.exit();
      return true;
    },
    stay,
    leave() {
      stay();
      port.exit();
    },
  };
}

export type SystemBackOwner = ReturnType<typeof createSystemBack>;
