import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { BackHandler, Platform } from 'react-native';
import { hasDrawingInk } from '../drawing/model';
import type { DrawingSession } from '../product/createDrawingSession';
import { createSystemBack, type SystemBackOwner } from '../product/systemBack';

const SystemBackScope = createContext<SystemBackOwner | null>(null);
const subscribeNever = () => () => {};
const closed = () => false;
const ignore = () => {};

export function BrowserBackProvider({
  session,
  children,
}: {
  session: DrawingSession;
  children: ReactNode;
}) {
  const owner = useMemo(
    () =>
      createSystemBack({
        hasInk: () => hasDrawingInk(session.currentDrawing()),
        exit: () => BackHandler.exitApp(),
      }),
    [session]
  );
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', owner.respond);
    return () => subscription.remove();
  }, [owner]);
  return <SystemBackScope.Provider value={owner}>{children}</SystemBackScope.Provider>;
}

export function useDialogBack(visible: boolean, onClose: () => void) {
  const owner = useContext(SystemBackScope);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (visible && owner) return owner.registerDialog(() => close.current());
  }, [owner, visible]);
}

export function useLeaveConfirm() {
  const owner = useContext(SystemBackScope);
  const open = useSyncExternalStore(
    owner?.subscribe ?? subscribeNever,
    owner?.isLeaveOpen ?? closed,
    owner?.isLeaveOpen ?? closed
  );
  return { open, stay: owner?.stay ?? ignore, leave: owner?.leave ?? ignore };
}
