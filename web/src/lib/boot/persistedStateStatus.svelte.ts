// Whether the credential hydration that boot kicks off has landed, so a surface
// that must not trust an empty credential mirror (the free-generation grant
// refresher) can wait for it. Flips once per page load; persistedState.ts is the
// only production writer.
export interface PersistedStateStatus {
  readonly hydrated: boolean;
  markHydrated(): void;
}

export function createPersistedStateStatus(): PersistedStateStatus {
  let hydrated = $state(false);
  return {
    get hydrated() {
      return hydrated;
    },
    markHydrated() {
      hydrated = true;
    },
  };
}

export const persistedStateStatus = createPersistedStateStatus();
