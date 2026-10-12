import { browser } from '$app/environment';
import {
  onDurableRestore,
  readInt,
  removeKey,
  STORAGE_KEYS,
  type StorageKey,
  writeInt,
} from '$lib/storage';

export const SETTINGS_ACTIVITY_DOTS_START_SESSION = 6;
export const INSTALL_REPROMPT_SESSION_MILESTONES = [5, 10] as const;

type SessionCounterKind = 'settingsActivity' | 'installReprompt';

const SESSION_COUNTER_LIMITS: Record<SessionCounterKind, number> = {
  settingsActivity: SETTINGS_ACTIVITY_DOTS_START_SESSION,
  installReprompt: Math.max(...INSTALL_REPROMPT_SESSION_MILESTONES),
};

const SESSION_COUNTER_STORAGE_KEYS: Record<SessionCounterKind, StorageKey> = {
  settingsActivity: STORAGE_KEYS.settingsActivitySessionCount,
  installReprompt: STORAGE_KEYS.installRepromptSessionCount,
};

// A stored count outside 0..limit is corrupt; clamping keeps every `>=`/`<`
// milestone comparison answering as it would for a count recordSession wrote.
function readSessionCount(kind: SessionCounterKind): number {
  const stored = readInt(SESSION_COUNTER_STORAGE_KEYS[kind], 0);
  return Math.min(SESSION_COUNTER_LIMITS[kind], Math.max(0, stored));
}

function readSessionCounts(): Record<SessionCounterKind, number> {
  return {
    settingsActivity: readSessionCount('settingsActivity'),
    installReprompt: readSessionCount('installReprompt'),
  };
}

export interface SessionCountersState {
  sessionCount(kind: SessionCounterKind): number;
  // Counts the current document once per kind, saturating at that kind's last
  // milestone; returns the count after recording.
  recordSession(kind: SessionCounterKind): number;
  excludeCurrentSession(kind: SessionCounterKind): void;
  clearSessionCount(kind: SessionCounterKind): void;
  reloadSessionCounters(): void;
}

export function createSessionCounters(): SessionCountersState {
  let sessionCounts = $state(readSessionCounts());

  const recordedDocuments: Record<SessionCounterKind, WeakSet<Document>> = {
    settingsActivity: new WeakSet<Document>(),
    installReprompt: new WeakSet<Document>(),
  };

  return {
    sessionCount(kind) {
      return sessionCounts[kind];
    },
    recordSession(kind) {
      if (!browser || recordedDocuments[kind].has(document)) return sessionCounts[kind];
      recordedDocuments[kind].add(document);

      const limit = SESSION_COUNTER_LIMITS[kind];
      if (sessionCounts[kind] >= limit) return sessionCounts[kind];

      sessionCounts[kind] += 1;
      writeInt(SESSION_COUNTER_STORAGE_KEYS[kind], sessionCounts[kind]);
      return sessionCounts[kind];
    },
    excludeCurrentSession(kind) {
      if (!browser) return;
      recordedDocuments[kind].add(document);
    },
    clearSessionCount(kind) {
      sessionCounts[kind] = 0;
      removeKey(SESSION_COUNTER_STORAGE_KEYS[kind]);
    },
    reloadSessionCounters() {
      sessionCounts = readSessionCounts();
    },
  };
}

export const sessionCountersState = createSessionCounters();

export const { sessionCount, recordSession } = sessionCountersState;

onDurableRestore(sessionCountersState.reloadSessionCounters);
