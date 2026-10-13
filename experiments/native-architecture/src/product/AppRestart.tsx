import { createContext, Fragment, useContext, useState, type ReactNode } from 'react';
import { reloadApp } from '../platform/appRestart';

// Outside an AppRestartRoot a restart can only reload a document, as the web export's would.
const AppRestartScope = createContext<() => void>(() => {
  reloadApp();
});

// The app's restart: the web reloads its root as shipping does, and the native apps, which have
// no document to reload, remount everything under this root with fresh owners.
export function AppRestartRoot({ children }: { children: ReactNode }) {
  const [launch, setLaunch] = useState(0);
  const restart = () => {
    if (!reloadApp()) setLaunch((count) => count + 1);
  };
  return (
    <AppRestartScope.Provider value={restart}>
      <Fragment key={launch}>{children}</Fragment>
    </AppRestartScope.Provider>
  );
}

export function useAppRestart() {
  return useContext(AppRestartScope);
}
