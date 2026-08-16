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
  installReprompt: INSTALL_REPROMPT_SESSION_MILESTONES.at(-1)!,
};

const SESSION_COUNTER_STORAGE_KEYS: Record<SessionCounterKind, StorageKey> = {
  settingsActivity: STORAGE_KEYS.settingsActivitySessionCount,
  installReprompt: STORAGE_KEYS.installRepromptSessionCount,
};

const recordedDocuments: Record<SessionCounterKind, WeakSet<Document>> = {
  settingsActivity: new WeakSet<Document>(),
  installReprompt: new WeakSet<Document>(),
};

function readSessionCounts(): Record<SessionCounterKind, number> {
  return {
    settingsActivity: readInt(STORAGE_KEYS.settingsActivitySessionCount, 0),
    installReprompt: readInt(STORAGE_KEYS.installRepromptSessionCount, 0),
  };
}

let sessionCounts = $state(readSessionCounts());

export function recordSession(kind: SessionCounterKind): number {
  if (!browser || recordedDocuments[kind].has(document)) return sessionCounts[kind];
  recordedDocuments[kind].add(document);

  const limit = SESSION_COUNTER_LIMITS[kind];
  if (sessionCounts[kind] >= limit) return sessionCounts[kind];

  sessionCounts[kind] += 1;
  writeInt(SESSION_COUNTER_STORAGE_KEYS[kind], sessionCounts[kind]);
  return sessionCounts[kind];
}

export function excludeCurrentSession(kind: SessionCounterKind) {
  if (!browser) return;
  recordedDocuments[kind].add(document);
}

export function sessionCount(kind: SessionCounterKind): number {
  return sessionCounts[kind];
}

export function clearSessionCount(kind: SessionCounterKind) {
  sessionCounts[kind] = 0;
  removeKey(SESSION_COUNTER_STORAGE_KEYS[kind]);
}

export function reloadSessionCounters() {
  sessionCounts = readSessionCounts();
}

onDurableRestore(reloadSessionCounters);
