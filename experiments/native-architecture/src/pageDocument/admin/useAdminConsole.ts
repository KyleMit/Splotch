import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminApi, AdminStats, TokenSnapshot } from './adminApi';
import type { AdminSessionStore } from './adminSession';

// What the console shows. The build renders `restoring` and so does hydration; the stored session
// is read only after it, so both renders match.
export type ConsoleView =
  | Readonly<{ mode: 'restoring' }>
  | Readonly<{ mode: 'signedOut'; error: string | null }>
  | Readonly<{ mode: 'loading'; session: string }>
  | Readonly<{ mode: 'unavailable'; session: string }>
  | Readonly<{
      mode: 'signedIn';
      session: string;
      snapshot: TokenSnapshot;
      figures: Figures;
    }>;

// The usage figures, read beside the code list and shown once they land: 'unavailable' when they
// could not be read, so the console says the tallies are unavailable.
export type Figures =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'read'; stats: AdminStats }>;

const PENDING: Figures = { kind: 'pending' };

export type Flash = Readonly<{ kind: 'success' | 'error'; text: string }>;

const CONNECTION_ERROR = 'Something went wrong. Check your connection and try again.';
export const SESSION_ENDED = 'That session no longer works. Sign in again.';
const COPY_FEEDBACK_MS = 1500;

type Confirm = (message: string) => boolean;
type Clipboard = (text: string) => Promise<void>;

export function removalQuestion(token: string) {
  return `Remove ${token}? Anyone using this code loses AI access.`;
}

function removalMessage(token: string, changed: boolean) {
  return changed ? `Removed “${token}”` : `“${token}” was not in the list — nothing was removed`;
}

export function useAdminConsole({
  api,
  sessions,
  confirm,
  writeClipboard,
}: {
  api: AdminApi;
  sessions: AdminSessionStore;
  confirm: Confirm;
  writeClipboard: Clipboard;
}) {
  const [view, setView] = useState<ConsoleView>({ mode: 'restoring' });
  const [flash, setFlash] = useState<Flash | null>(null);
  const [draft, setDraft] = useState('');
  const { busy, busyRef, run } = useOneRequestAtATime();
  // Which session a pending answer belongs to. Ending or replacing a session moves it on, so an
  // answer for the old one (a list still loading at sign-out, a late 401) changes nothing.
  const generation = useRef(0);
  const { copied, copy, endCopyFeedback } = useCopyFeedback(writeClipboard);

  const signOutWith = useCallback(
    (error: string | null) => {
      generation.current += 1;
      sessions.clear();
      endCopyFeedback();
      setDraft('');
      setFlash(null);
      setView({ mode: 'signedOut', error });
    },
    [sessions, endCopyFeedback]
  );

  const load = useCallback(
    async (session: string) => {
      const mine = generation.current;
      setView({ mode: 'loading', session });
      const figures = readFigures(api, session);
      try {
        const result = await api.list(session);
        if (generation.current !== mine) return;
        if (result.kind === 'unauthorized') return signOutWith(SESSION_ENDED);
        setView({ mode: 'signedIn', session, snapshot: result.snapshot, figures: PENDING });
      } catch {
        if (generation.current === mine) setView({ mode: 'unavailable', session });
        return;
      }
      const read = await figures;
      if (generation.current !== mine) return;
      setView(withFigures(read));
    },
    [api, signOutWith]
  );

  useEffect(() => {
    const stored = sessions.read();
    if (stored === null) setView({ mode: 'signedOut', error: null });
    else void load(stored);
  }, [sessions, load]);

  const signIn = (key: string) =>
    run(
      async () => {
        const result = await api.signIn(key);
        if (result.kind === 'refused') {
          setView({ mode: 'signedOut', error: result.message });
          return;
        }
        generation.current += 1;
        sessions.write(result.session);
        await load(result.session);
      },
      () => setView({ mode: 'signedOut', error: CONNECTION_ERROR })
    );

  const mutate = (
    session: string,
    change: () => ReturnType<AdminApi['add']>,
    describe: (changed: boolean) => string,
    onDone: () => void
  ) => {
    const mine = generation.current;
    return run(
      async () => {
        const result = await change();
        if (generation.current !== mine) return;
        if (result.kind === 'unauthorized') return signOutWith(SESSION_ENDED);
        if (result.kind === 'refused') return setFlash({ kind: 'error', text: result.message });
        setView(withSnapshot(session, result.snapshot));
        setFlash({ kind: 'success', text: describe(result.changed) });
        onDone();
      },
      () => {
        if (generation.current === mine) setFlash({ kind: 'error', text: CONNECTION_ERROR });
      }
    );
  };

  const add = (session: string) => {
    const token = draft.trim();
    return mutate(
      session,
      () => api.add(session, token),
      () => `Added “${token}”`,
      () => setDraft('')
    );
  };

  const remove = (session: string, token: string) => {
    if (busyRef.current || !confirm(removalQuestion(token))) return Promise.resolve();
    return mutate(
      session,
      () => api.remove(session, token),
      (changed) => removalMessage(token, changed),
      () => {}
    );
  };

  return {
    view,
    flash,
    busy,
    draft,
    setDraft,
    copied,
    signIn,
    signOut: () => signOutWith(null),
    retry: (session: string) => load(session),
    add,
    remove,
    copy,
  };
}

// A write's snapshot replaces the list and keeps the figures already read.
function withSnapshot(session: string, snapshot: TokenSnapshot) {
  return (previous: ConsoleView): ConsoleView => ({
    mode: 'signedIn',
    session,
    snapshot,
    figures: previous.mode === 'signedIn' ? previous.figures : PENDING,
  });
}

function withFigures(figures: Figures) {
  return (current: ConsoleView): ConsoleView =>
    current.mode === 'signedIn' ? { ...current, figures } : current;
}

// The figures are extra to the code list: the list never waits on them, the console still lists,
// adds and removes codes when they cannot be read, and the tokens call alone decides whether the
// session still works.
async function readFigures(api: AdminApi, session: string): Promise<Figures> {
  try {
    const result = await api.stats(session);
    return result.kind === 'read' ? { kind: 'read', stats: result.stats } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

// The "Copied!" a row's button shows for COPY_FEEDBACK_MS after its clipboard write lands.
function useCopyFeedback(writeClipboard: Clipboard) {
  const [copied, setCopied] = useState<{ key: string; announcement: string } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Bumped when a session ends, so a clipboard write still pending from it cannot mark a row of
  // the next one copied.
  const copySession = useRef(0);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const endCopyFeedback = useCallback(() => {
    copySession.current += 1;
    clearTimeout(copyTimer.current);
    setCopied(null);
  }, []);

  const copy = async (key: string, text: string, announcement: string) => {
    const session = copySession.current;
    try {
      await writeClipboard(text);
    } catch {
      return;
    }
    if (session !== copySession.current) return;
    clearTimeout(copyTimer.current);
    setCopied({ key, announcement });
    copyTimer.current = setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
  };

  return { copied, copy, endCopyFeedback };
}

// One request at a time: a second press while one is out does nothing.
function useOneRequestAtATime() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useCallback(async (work: () => Promise<void>, onFailure: () => void) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } catch {
      onFailure();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, busyRef, run };
}
