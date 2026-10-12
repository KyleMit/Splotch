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
import { drawingDraftStorage, drawingDraftStorageFor } from '../platform/drawingDraft';
import type { DrawingBackend } from './drawingBackend';
import { offlineLibrary } from '../offlineLibrary/runtime';

type SessionContext = { session: DrawingSession; draft: ReturnType<typeof createDrawingDraft> };
const DrawingSessionScope = createContext<SessionContext | null>(null);
const SESSION_ONLY_STATE: DrawingDraftState = { status: 'session', message: '' };
const subscribeSessionOnly = () => () => {};
const sessionOnlyState = () => SESSION_ONLY_STATE;

export function DrawingSessionProvider({
  children,
  backend = 'legacy',
}: {
  children: ReactNode;
  backend?: DrawingBackend;
}) {
  const [owner] = useState(() => {
    const session = createDrawingSession(backend);
    return {
      session,
      draft: createDrawingDraft(
        session,
        backend === 'legacy' ? drawingDraftStorage : drawingDraftStorageFor(backend),
        async (drawing) => {
          await offlineLibrary.openPage(drawing.pageId);
        }
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
