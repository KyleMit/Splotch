import { browser } from '$app/environment';
import { isNative } from '$lib/platform';
import { lazyPluginModule } from './nativePlugin';
import { STORAGE_KEYS, type StorageKey } from './storageKeys';

export { STORAGE_KEYS, type StorageKey } from './storageKeys';

// Storage is dual-layer so the web app and the native apps share one code path:
//
//  • Reads are synchronous from localStorage. In the browser that's the real
//    store; inside a native WebView it's a fast, always-present cache. Keeping
//    reads sync lets the $state stores initialise without an async flash.
//  • On native we additionally mirror every write to Capacitor Preferences,
//    which is backed by durable UserDefaults/SharedPreferences. iOS can evict
//    WebView localStorage under storage pressure; Preferences survives, so on
//    startup `hydrateDurableStorage()` repopulates localStorage from it.
//
// On the web, isNative() is false and the Preferences layer is skipped entirely
// — a pure localStorage store.

const hydrationKeys: StorageKey[] = Object.values(STORAGE_KEYS);

// Each persisted store registers its reloader here at module init, so
// hydrateDurableStorage() can refresh every live store after a native recovery
// without a hand-maintained call-site list (issue #521). Returns a disposer,
// mainly so tests can unregister.
const durableRestoreCallbacks = new Set<() => void>();

export function onDurableRestore(cb: () => void) {
  durableRestoreCallbacks.add(cb);
  return () => durableRestoreCallbacks.delete(cb);
}

// localStorage.setItem can throw — QuotaExceededError when storage is full, or
// SecurityError in locked-down / private-mode WebViews. These run synchronously
// inside every settings setX handler, so an escaping throw would break the toggle
// that triggered it. Swallow the failure (the native durable mirror still backs
// the value up) and warn at most once so we don't spam the console.
let storageMutationWarned = false;
/** Returns whether the write landed, so a caller can tell a real change from a swallowed failure. */
function safeStorageMutation(op: () => void): boolean {
  try {
    op();
    return true;
  } catch (err) {
    if (!storageMutationWarned) {
      storageMutationWarned = true;
      console.warn('localStorage write failed; relying on durable mirror', err);
    }
    return false;
  }
}

// Reads can throw too — merely touching the `localStorage` global raises
// SecurityError when storage is disabled (Chrome "block all cookies", sandboxed
// iframes, private-mode WebViews). Reads run at module init inside $state
// initializers, so an escaping throw would kill hydration; return the caller's
// fallback instead — the same degrade model as the app.html boot script.
let storageReadWarned = false;
function safeStorageRead<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch (err) {
    if (!storageReadWarned) {
      storageReadWarned = true;
      console.warn('localStorage read failed; using fallback', err);
    }
    return fallback;
  }
}

// Load the durable store lazily. Returns the module namespace, not the
// Preferences proxy — see lazyPluginModule for why that distinction matters.
// The __IS_CAPACITOR__ ternary keeps the import() itself out of the web bundle
// (Rollup retains the thunk even when every caller is dead code); the reject arm
// is unreachable because every call site is gated on __IS_CAPACITOR__ too.
const getPrefs = lazyPluginModule(() =>
  __IS_CAPACITOR__
    ? import('@capacitor/preferences')
    : Promise.reject(new Error('native-only plugin'))
);

type DurablePreferences = Awaited<ReturnType<typeof getPrefs>>['Preferences'];

async function runWithDurablePreferences<T>(
  operation: (preferences: DurablePreferences) => Promise<T>
): Promise<T | undefined> {
  if (!__IS_CAPACITOR__ || !isNative()) return undefined;
  try {
    const { Preferences } = await getPrefs();
    return await operation(Preferences);
  } catch {
    return undefined;
  }
}

// Fire-and-forget durable mirror. Never throws into the caller — a failed
// durable write just means we fall back to the localStorage copy.
function mirror(key: StorageKey, value: string) {
  if (!__IS_CAPACITOR__ || !isNative()) return;
  // A new value supersedes a removal that never landed.
  setDurableRemovalPending(key, false);
  void runWithDurablePreferences((Preferences) => Preferences.set({ key, value }));
}

// The keys removeKey has asked Preferences to forget and not yet heard back
// about. Kept in localStorage and mirrored like any value, so the list itself
// survives a WebView eviction through the same durable copy it guards.
function parsePendingDurableRemovals(raw: string | null): StorageKey[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? hydrationKeys.filter(
          (key) => key !== STORAGE_KEYS.pendingDurableRemovals && parsed.includes(key)
        )
      : [];
  } catch {
    return [];
  }
}

function localPendingDurableRemovals(): Set<StorageKey> {
  return new Set(
    parsePendingDurableRemovals(
      safeStorageRead(() => localStorage.getItem(STORAGE_KEYS.pendingDurableRemovals), null)
    )
  );
}

function persistPendingDurableRemovals(pending: ReadonlySet<StorageKey>) {
  const next = JSON.stringify([...pending]);
  safeStorageMutation(() => localStorage.setItem(STORAGE_KEYS.pendingDurableRemovals, next));
  void runWithDurablePreferences((Preferences) =>
    Preferences.set({ key: STORAGE_KEYS.pendingDurableRemovals, value: next })
  );
}

function setDurableRemovalPending(key: StorageKey, pending: boolean) {
  const current = localPendingDurableRemovals();
  if (current.has(key) === pending) return;
  if (pending) current.add(key);
  else current.delete(key);
  persistPendingDurableRemovals(current);
}

// Resolves whether Preferences no longer holds the key. The caller owns the
// pending list it settles on success, since the two copies of that list can
// disagree and a clear computed from one copy alone would drop the other's
// entries.
async function forgetInDurablePreferences(
  Preferences: DurablePreferences,
  key: StorageKey
): Promise<boolean> {
  try {
    await Preferences.remove({ key });
    return true;
  } catch {
    return false;
  }
}

export async function writeCaptureReportToPreferences(
  nonce: string,
  value: string
): Promise<boolean> {
  if (!browser) return false;
  return (
    (await runWithDurablePreferences(async (Preferences) => {
      await Preferences.set({ key: nonce, value });
      return true;
    })) === true
  );
}

export async function removeCaptureReportFromPreferences(nonce: string): Promise<boolean> {
  if (!browser) return false;
  return (
    (await runWithDurablePreferences(async (Preferences) => {
      await Preferences.remove({ key: nonce });
      return true;
    })) === true
  );
}

export function readBool(key: StorageKey, fallback: boolean): boolean {
  if (!browser) return fallback;
  return safeStorageRead(() => {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  }, fallback);
}

export function writeBool(key: StorageKey, value: boolean) {
  if (!browser) return;
  const str = value ? 'true' : 'false';
  safeStorageMutation(() => localStorage.setItem(key, str));
  mirror(key, str);
}

export function readString(key: StorageKey, fallback: string): string;
export function readString(key: StorageKey, fallback: null): string | null;
export function readString(key: StorageKey, fallback: string | null): string | null {
  if (!browser) return fallback;
  return safeStorageRead(() => {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  }, fallback);
}

export function writeString(key: StorageKey, value: string) {
  if (!browser) return;
  safeStorageMutation(() => localStorage.setItem(key, value));
  mirror(key, value);
}

// Delete a key from localStorage and, on native, its durable Preferences mirror.
// Used to scrub a value that has moved elsewhere (e.g. a plaintext API key that's
// been migrated into secure storage). The durable removal is recorded as pending
// first: if it never lands (bridge error, app killed), the next durable restore
// would otherwise copy the Preferences value straight back into localStorage.
export function removeKey(key: StorageKey) {
  if (!browser) return;
  safeStorageMutation(() => localStorage.removeItem(key));
  if (!__IS_CAPACITOR__ || !isNative()) return;
  setDurableRemovalPending(key, true);
  void runWithDurablePreferences(async (Preferences) => {
    if (await forgetInDurablePreferences(Preferences, key)) setDurableRemovalPending(key, false);
  });
}

// The `allowed` list has already narrowed the value by the time it is returned, so the signature
// carries that through rather than making every caller re-assert it: a closed set of stored
// values is exactly where an `as` cast would otherwise sit, one step after the validation that
// made it true. Mirrors readString's overload pair above.
export function readInt(key: StorageKey, fallback: number): number;
export function readInt<T extends number>(key: StorageKey, fallback: T, allowed: readonly T[]): T;
export function readInt(
  key: StorageKey,
  fallback: number,
  allowed: readonly number[] | null = null
): number {
  if (!browser) return fallback;
  return safeStorageRead(() => {
    const raw = parseInt(localStorage.getItem(key) ?? '', 10);
    if (Number.isNaN(raw)) return fallback;
    if (allowed && !allowed.includes(raw)) return fallback;
    return raw;
  }, fallback);
}

export function writeInt(key: StorageKey, value: number) {
  if (!browser) return;
  const str = String(value);
  safeStorageMutation(() => localStorage.setItem(key, str));
  mirror(key, str);
}

export function reconcileStorageValues(local: string | null, durable: string | null) {
  if (local === null && durable !== null) return { restore: durable };
  if (local !== null && durable === null) return { backup: local };
  return {};
}

function notifyDurableRestore() {
  for (const cb of durableRestoreCallbacks) cb();
}

/**
 * Reconcile the durable Preferences store with localStorage (native only).
 * Restores any key the WebView dropped, and seeds Preferences with any value
 * that only exists in localStorage (e.g. settings saved before this upgrade).
 * Returns true if localStorage was changed, so callers can reload their stores.
 */
export async function hydrateDurableStorage() {
  let restored = false;
  const completedRestore = await runWithDurablePreferences(async (Preferences) => {
    // Fire every durable get concurrently rather than one serial bridge
    // round-trip per declared key on the cold-start critical path.
    const durable = await Promise.all(hydrationKeys.map((key) => Preferences.get({ key })));
    // The union of both copies is the working list for this pass: after a
    // WebView eviction only the durable copy still names the removals that
    // never landed, and after a failed local write only the durable copy has
    // the newest entry. Every settlement below persists from this set, never
    // from a re-read of one copy.
    const pendingRemovals = new Set([
      ...localPendingDurableRemovals(),
      ...parsePendingDurableRemovals(
        durable[hydrationKeys.indexOf(STORAGE_KEYS.pendingDurableRemovals)].value
      ),
    ]);
    const settleRemoval = (key: StorageKey) => {
      pendingRemovals.delete(key);
      persistPendingDurableRemovals(pendingRemovals);
    };
    const backups: Promise<unknown>[] = [];
    hydrationKeys.forEach((key, i) => {
      const local = safeStorageRead(() => localStorage.getItem(key), null);
      if (pendingRemovals.has(key)) {
        // A value written since the removal supersedes it; its own clear of
        // the list may not have landed, so it is settled here instead.
        if (local !== null) settleRemoval(key);
        else {
          backups.push(
            forgetInDurablePreferences(Preferences, key).then((forgotten) => {
              if (forgotten) settleRemoval(key);
            })
          );
          return;
        }
      }
      const { value } = durable[i];
      const action = reconcileStorageValues(local, value);
      if (action.restore !== undefined) {
        // WebView lost it — recover from durable store. Only a write that actually
        // landed counts as a restore: the callers this return value gates re-read
        // localStorage, so a swallowed failure must not claim it changed.
        if (safeStorageMutation(() => localStorage.setItem(key, action.restore))) restored = true;
      } else if (action.backup !== undefined) {
        backups.push(Preferences.set({ key, value: action.backup })); // back up the existing value
      }
    });
    await Promise.all(backups);
    return restored;
  });
  if (completedRestore !== undefined) restored = completedRestore;
  // localStorage is now repopulated, so every registered reloader re-reads fresh
  // values. Only fire when something actually changed — a no-op restore leaves
  // the live stores untouched.
  if (restored) {
    notifyDurableRestore();
  }
  return restored;
}
