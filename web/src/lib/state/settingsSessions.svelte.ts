import { browser } from '$app/environment';
import { onDurableRestore, readInt, STORAGE_KEYS, writeInt } from '$lib/storage';

const ACTIVITY_DOTS_START_SESSION = 6;
const recordedDocuments = new WeakSet<Document>();

let sessionCount = $state(readInt(STORAGE_KEYS.settingsActivitySessionCount, 0));

export function recordSettingsActivitySession() {
  if (!browser || recordedDocuments.has(document)) return;
  recordedDocuments.add(document);
  if (sessionCount >= ACTIVITY_DOTS_START_SESSION) return;
  sessionCount += 1;
  writeInt(STORAGE_KEYS.settingsActivitySessionCount, sessionCount);
}

export function settingsActivityDotsEnabled(): boolean {
  return sessionCount >= ACTIVITY_DOTS_START_SESSION;
}

export function reloadSettingsActivitySession() {
  sessionCount = readInt(STORAGE_KEYS.settingsActivitySessionCount, 0);
}

onDurableRestore(reloadSettingsActivitySession);
