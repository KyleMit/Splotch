import { BrowserBackProvider } from '../platform/BrowserBack';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createDrawingSession, type DrawingSession } from './createDrawingSession';
import { createDrawingDraft, type DrawingDraftState } from './createDrawingDraft';
import { drawingDraftStorage } from '../platform/drawingDraft';
import { offlineLibrary } from '../offlineLibrary/runtime';
import { createHistory } from '../drawing/model';
import { useAppRestart, useFreshStart } from './AppRestart';

type SessionContext = { session: DrawingSession; draft: ReturnType<typeof createDrawingDraft> };
const DrawingSessionScope = createContext<SessionContext | null>(null);
const SESSION_ONLY_STATE: DrawingDraftState = { status: 'session', message: '' };
const subscribeSessionOnly = () => () => {};
const sessionOnlyState = () => SESSION_ONLY_STATE;

export function DrawingSessionProvider({ children }: { children: ReactNode }) {
  const fresh = useFreshStart();
  const [owner] = useState(() => {
    const session = createDrawingSession();
    return {
      session,
      draft: createDrawingDraft(
        session,
        drawingDraftStorage,
        async (drawing) => {
          await offlineLibrary.openPage(drawing.pageId);
        },
        fresh
      ),
    };
  });
  useEffect(() => {
    void owner.draft.start();
    return () => owner.draft.dispose();
  }, [owner]);
  return (
    <DrawingSessionScope.Provider value={owner}>
      <BrowserBackProvider session={owner.session}>{children}</BrowserBackProvider>
    </DrawingSessionScope.Provider>
  );
}

export function useDrawingHistory() {
  const shared = useContext(DrawingSessionScope);
  const [local] = useState(createDrawingSession);
  const owner = shared?.session ?? local;
  const history = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);
  const draftState = useSyncExternalStore(
    shared?.draft.subscribe ?? subscribeSessionOnly,
    shared?.draft.getSnapshot ?? sessionOnlyState,
    shared?.draft.getSnapshot ?? sessionOnlyState
  );
  const references = useMemo(
    () => ({
      historyRef: {
        get current() {
          return owner.getSnapshot();
        },
      },
      coloringBookEnabled: {
        get current() {
          return owner.isColoringBookEnabled();
        },
      },
    }),
    [owner]
  );
  return {
    history,
    ...references,
    setHistory: owner.setHistory,
    currentDrawing: owner.currentDrawing,
    applyColoringBookEnabled: owner.applyColoringBookEnabled,
    draftState,
    retryDraft: async () => {
      await shared?.draft.retry();
    },
  };
}

// Shipping's Start over: the app restarts on a fresh drawing, since nothing of the picture outlives
// a shipping restart. The blank page is stored first, and the restart is a fresh launch that never
// reads the draft back, so a store that refused the blank page cannot return the old picture.
export function useStartOver() {
  const shared = useContext(DrawingSessionScope);
  const restart = useAppRestart();
  return async () => {
    shared?.session.setHistory(createHistory());
    try {
      await shared?.draft.discard();
    } catch {
      // The fresh launch stores its blank page again and never reads this draft back.
    }
    restart();
  };
}
