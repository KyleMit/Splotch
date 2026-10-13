import { createContext, useContext, useState, type ReactNode } from 'react';
import { OfflineArtworkScope } from './artworkContext';
import type { OfflineLibrary, LibrarySnapshot } from './controller';
import type { Pack } from './manifest';
export type LibraryContext = Readonly<{
  state: LibrarySnapshot;
  owner: OfflineLibrary;
  remove: () => Promise<void>;
}>;
const LibraryScope = createContext<LibraryContext | null>(null);
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

// The books a picker lists while it is open: the inventory as it stood when the picker opened, or,
// if the picker opened before an inventory had completed (on web the launch inventory waits for
// first paint, and a failed one waits for Retry), as it stood once one did. A book that finishes
// downloading later waits for the next open.
export function useHeldBooks(library: LibraryContext | null): readonly Pack[] {
  const inventoried = library?.state.inventoried === true;
  const [held, setHeld] = useState<readonly Pack[] | null>(() =>
    library && inventoried ? library.state.installed : null
  );
  if (held === null && library && inventoried) {
    setHeld(library.state.installed);
    return library.state.installed;
  }
  return held ?? [];
}
