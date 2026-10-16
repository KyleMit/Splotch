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
import { createHistory } from '../drawing/model';
import { useAppRestart } from './AppRestart';

const DrawingSessionScope = createContext<DrawingSession | null>(null);

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
    paperPresentations: owner.paperPresentations,
    ...references,
    setHistory: owner.setHistory,
    currentDrawing: owner.currentDrawing,
    applyColoringBookEnabled: owner.applyColoringBookEnabled,
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
