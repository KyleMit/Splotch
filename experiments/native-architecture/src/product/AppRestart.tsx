import { createContext, Fragment, useContext, useState, type ReactNode } from 'react';
import { reloadApp, takeFreshStart } from '../platform/appRestart';

type Launch = Readonly<{ count: number; fresh: boolean }>;

// Outside an AppRestartRoot a restart can only reload a document, as the web export's would.
const AppRestartScope = createContext<() => void>(() => {
  reloadApp();
});
const FreshStartScope = createContext(false);

// The app's restart: the web reloads its root as shipping does, and the native apps, which have
// no document to reload, remount everything under this root with fresh owners. Either way the
// launch that follows is a fresh start, which reads no stored picture back.
export function AppRestartRoot({ children }: { children: ReactNode }) {
  const [launch, setLaunch] = useState<Launch>(() => ({ count: 0, fresh: takeFreshStart() }));
  const restart = () => {
    if (!reloadApp()) setLaunch(({ count }) => ({ count: count + 1, fresh: true }));
  };
  return (
    <AppRestartScope.Provider value={restart}>
      <FreshStartScope.Provider value={launch.fresh}>
        <Fragment key={launch.count}>{children}</Fragment>
      </FreshStartScope.Provider>
    </AppRestartScope.Provider>
  );
}

export function useAppRestart() {
  return useContext(AppRestartScope);
}

export function useFreshStart() {
  return useContext(FreshStartScope);
}
