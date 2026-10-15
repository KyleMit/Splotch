import { BrowserBackProvider } from '../platform/BrowserBack';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createDrawingSession, type DrawingSession } from './createDrawingSession';
import type { DrawingDraftState } from './createDrawingDraft';
import { createHistory } from '../drawing/model';
import { useAppRestart } from './AppRestart';

const DrawingSessionScope = createContext<DrawingSession | null>(null);
const SESSION_ONLY_STATE: DrawingDraftState = { status: 'session', message: '' };
const subscribeSessionOnly = () => () => {};
const sessionOnlyState = () => SESSION_ONLY_STATE;

export function DrawingSessionProvider({ children }: { children: ReactNode }) {
  const [owner] = useState(createDrawingSession);
  return (
    <DrawingSessionScope.Provider value={owner}>
      <BrowserBackProvider session={owner}>{children}</BrowserBackProvider>
    </DrawingSessionScope.Provider>
  );
}

export function useDrawingHistory() {
  const shared = useContext(DrawingSessionScope);
  const [local] = useState(createDrawingSession);
  const owner = shared ?? local;
  const history = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);
  const draftState = useSyncExternalStore(subscribeSessionOnly, sessionOnlyState, sessionOnlyState);
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
    retryDraft: async () => {},
  };
}

export function useStartOver() {
  const shared = useContext(DrawingSessionScope);
  const restart = useAppRestart();
  return async () => {
    shared?.setHistory(createHistory());
    restart();
  };
}
