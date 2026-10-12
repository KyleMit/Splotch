import type { ReactNode } from 'react';
import type { DrawingSession } from '../product/createDrawingSession';

export function BrowserBackProvider({
  children,
}: {
  session: DrawingSession;
  children: ReactNode;
}) {
  return children;
}

export function useDialogBack(_visible: boolean, _onClose: () => void) {}
