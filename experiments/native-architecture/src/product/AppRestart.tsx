import { createContext, Fragment, useContext, useState, type ReactNode } from 'react';
import { reloadApp } from '../platform/appRestart';

const AppRestartScope = createContext<() => void>(() => {
  reloadApp();
});

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
