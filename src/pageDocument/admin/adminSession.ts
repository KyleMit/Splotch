import { ADMIN_SESSION_KEY } from './adminContract';

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type AdminSessionStore = ReturnType<typeof createAdminSessionStore>;

// The bearer session, kept under ADMIN_SESSION_KEY. Storage that throws (blocked site data) or is
// absent leaves the console working for this tab alone: it holds the session in its own state.
export function createAdminSessionStore(storage: () => SessionStorage | null) {
  return {
    read(): string | null {
      try {
        return storage()?.getItem(ADMIN_SESSION_KEY) || null;
      } catch {
        return null;
      }
    },
    write(session: string) {
      try {
        storage()?.setItem(ADMIN_SESSION_KEY, session);
      } catch {
        // The session lives on in the console's state until the tab closes.
      }
    },
    clear() {
      try {
        storage()?.removeItem(ADMIN_SESSION_KEY);
      } catch {
        // Nothing stored to clear.
      }
    },
  };
}

export const browserSessionStore = createAdminSessionStore(() =>
  typeof localStorage === 'undefined' ? null : localStorage
);
