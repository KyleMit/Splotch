import { createContext, useContext, type ReactNode } from 'react';
import { OfflineArtworkScope } from './artworkContext';
import type { OfflineLibrary, LibrarySnapshot } from './controller';
export type LibraryContext = Readonly<{
  state: LibrarySnapshot;
  owner: OfflineLibrary;
  remove: () => Promise<void>;
}>;
export const LibraryScope = createContext<LibraryContext | null>(null);
export function LibraryProvider({
  state,
  owner,
  remove,
  children,
}: {
  state: LibrarySnapshot;
  owner: OfflineLibrary;
  remove: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <LibraryScope.Provider value={{ state, owner, remove }}>
      <OfflineArtworkScope.Provider value={state.artwork}>{children}</OfflineArtworkScope.Provider>
    </LibraryScope.Provider>
  );
}
export function useLibraryControls() {
  return useContext(LibraryScope);
}
