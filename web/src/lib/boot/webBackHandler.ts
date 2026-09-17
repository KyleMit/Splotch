import { pushState } from '$app/navigation';
import { page } from '$app/state';
import { observeModalStack } from '$lib/actions/modalDialog.svelte';
import { isStandalone } from '$lib/platform';
import { respondToDialogBack } from './dialogBack';

const COARSE_POINTER_QUERY = '(pointer: coarse)';
export const WEB_BACK_PAGE_STATE_KEY = 'splotchBackNavigation';

interface BackStack {
  guard: boolean;
  dialogs: number;
}

interface WebBackHandler {
  setCanvasEmpty: (empty: boolean) => void;
  stop: () => void;
}

const BASE_STACK: BackStack = { guard: false, dialogs: 0 };

let browserSession: string | undefined;
let drawingGuardConsumed = false;

function sessionId(): string {
  browserSession ??= globalThis.crypto.randomUUID();
  return browserSession;
}

function currentMarker(): App.PageState['splotchBackNavigation'] {
  const marker = page.state[WEB_BACK_PAGE_STATE_KEY];
  if (
    !marker ||
    typeof marker.session !== 'string' ||
    typeof marker.guard !== 'boolean' ||
    !Number.isInteger(marker.dialogs) ||
    marker.dialogs < 0
  ) {
    return undefined;
  }
  return marker;
}

function stackFromMarker(marker: NonNullable<ReturnType<typeof currentMarker>>): BackStack {
  return { guard: marker.guard, dialogs: marker.dialogs };
}

export function installWebBackHandler(): WebBackHandler {
  const session = sessionId();
  const drawingGuardEligible = isStandalone() || matchMedia(COARSE_POINTER_QUERY).matches;
  const initialMarker = currentMarker();
  let current = BASE_STACK;
  let canvasEmpty = true;
  let stopped = false;
  let restoredDialogsRemaining = 0;
  let historyDismissalsPending = 0;
  let controlledBacksPending = 0;
  let guardRemovalPending = false;

  function pushStack(stack: BackStack) {
    pushState('', {
      ...page.state,
      splotchBackNavigation: { session, guard: stack.guard, dialogs: stack.dialogs },
    });
    current = stack;
  }

  function reconcileDrawingGuard() {
    if (
      stopped ||
      current.dialogs > 0 ||
      controlledBacksPending > 0 ||
      guardRemovalPending ||
      !drawingGuardEligible ||
      drawingGuardConsumed
    ) {
      return;
    }
    if (!canvasEmpty && !current.guard) {
      pushStack({ guard: true, dialogs: 0 });
    } else if (canvasEmpty && current.guard) {
      guardRemovalPending = true;
      history.back();
    }
  }

  function restoreRefusedDialog(previous: BackStack) {
    historyDismissalsPending -= 1;
    pushStack(previous);
  }

  function handlePopState() {
    if (stopped) return;
    const marker = currentMarker();
    const target = marker?.session === session ? stackFromMarker(marker) : BASE_STACK;

    if (controlledBacksPending > 0) {
      controlledBacksPending -= 1;
      current = target;
      reconcileDrawingGuard();
      return;
    }
    if (guardRemovalPending) {
      guardRemovalPending = false;
      current = target;
      reconcileDrawingGuard();
      return;
    }

    const previous = current;
    if (previous.dialogs > target.dialogs) {
      historyDismissalsPending += 1;
      const response = respondToDialogBack();
      if (response === 'closed-dialog') {
        current = target;
        reconcileDrawingGuard();
      } else if (response === 'no-dialog') {
        historyDismissalsPending -= 1;
        current = target;
        reconcileDrawingGuard();
      } else {
        restoreRefusedDialog(previous);
      }
      return;
    }
    if (previous.guard && !target.guard) drawingGuardConsumed = true;
    current = target;
    restoredDialogsRemaining = target.dialogs;
    reconcileDrawingGuard();
  }

  addEventListener('popstate', handlePopState);

  if (initialMarker?.session === session) {
    current = stackFromMarker(initialMarker);
    restoredDialogsRemaining = current.dialogs;
  }

  const stopObservingModals = observeModalStack({
    opened() {
      if (stopped) return;
      if (restoredDialogsRemaining > 0) {
        restoredDialogsRemaining -= 1;
        return;
      }
      pushStack({ ...current, dialogs: current.dialogs + 1 });
    },
    closing() {
      if (stopped) return;
      if (historyDismissalsPending > 0) {
        historyDismissalsPending -= 1;
        return;
      }
      if (current.dialogs === 0) return;
      controlledBacksPending += 1;
      history.back();
    },
  });

  return {
    setCanvasEmpty(empty) {
      canvasEmpty = empty;
      reconcileDrawingGuard();
    },
    stop() {
      stopped = true;
      removeEventListener('popstate', handlePopState);
      stopObservingModals();
    },
  };
}
