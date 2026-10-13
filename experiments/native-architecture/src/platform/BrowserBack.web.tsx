import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { hasDrawingInk } from '../drawing/model';
import { createBrowserBack, type BrowserBackOwner } from '../product/browserBack';
import type { DrawingSession } from '../product/createDrawingSession';

const BrowserBackScope = createContext<BrowserBackOwner | null>(null);

export function BrowserBackProvider({
  session,
  children,
}: {
  session: DrawingSession;
  children: ReactNode;
}) {
  const [owner, setOwner] = useState<BrowserBackOwner | null>(null);
  const retainedOwner = useRef<BrowserBackOwner | null>(null);
  useEffect(() => {
    const back =
      retainedOwner.current ??
      createBrowserBack(
        {
          state: () => history.state,
          url: () => location.href,
          push: (state) => history.pushState(state, '', location.href),
          replace: (state) => history.replaceState(state, '', location.href),
          back: () => history.back(),
          listen: (listener) => {
            addEventListener('popstate', listener);
            return () => removeEventListener('popstate', listener);
          },
        },
        {
          owner: crypto.randomUUID(),
          runtime: String(performance.timeOrigin),
          guardEligible:
            matchMedia('(pointer: coarse)').matches ||
            matchMedia('(display-mode: standalone)').matches,
        }
      );
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
  }, [session]);
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
