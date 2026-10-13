import { createLazyExport } from '../lazyExport';

// Shipping's SETTINGS_ACTIVITY_DOTS_START_SESSION (sessionCounters.svelte.ts): a new parent's
// first sessions are spent learning the app, so the hub's activity dots wait for the sixth.
// native-settings-sections.test.mjs reads it from shipping.
export const SETTINGS_ACTIVITY_DOTS_START_SESSION = 6;

export type SessionCountStorage = {
  read: () => Promise<string | null>;
  write: (count: string) => Promise<void>;
};

// A stored count outside 0..limit is corrupt; clamping keeps the milestone comparison answering
// as it would for a count this module wrote.
function storedCount(raw: string | null) {
  const count = raw === null ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(count)) return 0;
  return Math.min(SETTINGS_ACTIVITY_DOTS_START_SESSION, Math.max(0, count));
}

// Unreadable or unwritable storage counts as a first visit, as shipping's readInt/writeInt do,
// so the count never rejects and the lazy export never retries it into a second session.
async function recordSession(storage: SessionCountStorage) {
  const count = storedCount(await storage.read().catch(() => null));
  if (count >= SETTINGS_ACTIVITY_DOTS_START_SESSION) return count;
  const next = count + 1;
  await storage.write(String(next)).catch(() => {});
  return next;
}

// Counts this launch once, saturating at the milestone, and resolves to the count after it.
export function createSettingsSessions(storage: SessionCountStorage) {
  return createLazyExport(() => recordSession(storage));
}

export function activityDotsShown(sessions: number | undefined) {
  return (sessions ?? 0) >= SETTINGS_ACTIVITY_DOTS_START_SESSION;
}
