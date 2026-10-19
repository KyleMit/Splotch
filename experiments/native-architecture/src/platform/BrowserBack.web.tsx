import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { currentAppPage, prerenderedAppPage, subscribeAppPage } from './appPath';
import { hasDrawingInk } from '../drawing/model';
import {
  createBrowserBack,
  type BrowserBackOwner,
  type BrowserHistoryPort,
} from '../product/browserBack';
import { withoutInviteParam } from '../ai/inviteLink';
import type { DrawingSession } from '../product/createDrawingSession';

// Exported so tools/migration/tests/inviteLinks.web.test.mjs drives the real port.
export function browserHistoryPort(): BrowserHistoryPort {
  return {
    state: () => history.state,
    // Invite capture strips its parameter after this owner records the page URL; that is not a
    // navigation away from the drawing.
    url: () => withoutInviteParam(location.href),
    push: (state) => history.pushState(state, '', location.href),
    replace: (state) => history.replaceState(state, '', location.href),
    back: () => history.back(),
    listen: (listener) => {
      addEventListener('popstate', listener);
      return () => removeEventListener('popstate', listener);
    },
  };
}

const BrowserBackScope = createContext<BrowserBackOwner | null>(null);

export function BrowserBackProvider({
  session,
  children,
}: {
  session: DrawingSession;
  children: ReactNode;
}) {
  const drawingPage =
    useSyncExternalStore(subscribeAppPage, currentAppPage, prerenderedAppPage) === 'drawing';
  const [owner, setOwner] = useState<BrowserBackOwner | null>(null);
  const retainedOwner = useRef<BrowserBackOwner | null>(null);
  useEffect(() => {
    if (!drawingPage) return;
    const back =
      retainedOwner.current ??
      createBrowserBack(browserHistoryPort(), {
        owner: crypto.randomUUID(),
        runtime: String(performance.timeOrigin),
        guardEligible:
          matchMedia('(pointer: coarse)').matches ||
          matchMedia('(display-mode: standalone)').matches,
      });
    retainedOwner.current = back;
    function changed() {
      back.setDrawingInk(hasDrawingInk(session.currentDrawing()));
    }
    changed();
    back.start();
    const unsubscribe = session.subscribe(changed);
    setOwner(back);
    return () => {
      unsubscribe();
      back.stop();
    };
  }, [session, drawingPage]);
  return <BrowserBackScope.Provider value={owner}>{children}</BrowserBackScope.Provider>;
}

export function useDialogBack(visible: boolean, onClose: () => void) {
  const owner = useContext(BrowserBackScope);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (visible && owner) return owner.registerDialog(() => close.current());
  }, [owner, visible]);
}

const LEAVE_CONFIRM_CLOSED = { open: false, stay: () => {}, leave: () => {} };

export function useLeaveConfirm() {
  return LEAVE_CONFIRM_CLOSED;
}

export function useBackAwareDrawingState() {
  return useState(false);
}
