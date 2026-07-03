import { browser } from '$app/environment';
import { isNative } from './platform';
import { lazyPluginModule } from './nativePlugin';

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
// — behaviour is identical to before.

// Every key that flows through read*/write* is remembered so the durable layer
// knows exactly what to back up and restore. State stores read their keys at
// init (before hydrate runs), so this set is complete by then.
const managedKeys = new Set<string>();

function track(key: string) {
  managedKeys.add(key);
}

// localStorage.setItem can throw — QuotaExceededError when storage is full, or
// SecurityError in locked-down / private-mode WebViews. These run synchronously
// inside every settings setX handler, so an escaping throw would break the toggle
// that triggered it. Swallow the failure (the native durable mirror still backs
// the value up) and warn at most once so we don't spam the console.
let storageWarned = false;
function safeLocalStorage(op: () => void) {
  try {
    op();
  } catch (err) {
    if (!storageWarned) {
      storageWarned = true;
      console.warn('localStorage write failed; relying on durable mirror', err);
    }
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

// Fire-and-forget durable mirror. Never throws into the caller — a failed
// durable write just means we fall back to the localStorage copy. The literal
// __IS_CAPACITOR__ guards (here and below) make the Preferences paths
// compile-time dead on web so Rollup drops the plugin chunk; isNative() alone
// is a runtime check it can't tree-shake.
function mirror(key: string, value: string) {
  if (__IS_CAPACITOR__ && isNative()) {
    getPrefs()
      .then(({ Preferences }) => Preferences.set({ key, value: String(value) }))
      .catch(() => {});
  }
}

export function readBool(key: string, fallback: boolean): boolean {
  track(key);
  if (!browser) return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

export function writeBool(key: string, value: boolean) {
  track(key);
  if (!browser) return;
  const str = value ? 'true' : 'false';
  safeLocalStorage(() => localStorage.setItem(key, str));
  mirror(key, str);
}

export function readString<T extends string | null>(key: string, fallback: T): string | T {
  track(key);
  if (!browser) return fallback;
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw;
}

export function writeString(key: string, value: string) {
  track(key);
  if (!browser) return;
  safeLocalStorage(() => localStorage.setItem(key, value));
  mirror(key, value);
}

// Delete a key from localStorage and, on native, its durable Preferences mirror.
// Used to scrub a value that has moved elsewhere (e.g. a plaintext API key that's
// been migrated into secure storage).
export function removeKey(key: string) {
  track(key);
  if (!browser) return;
  safeLocalStorage(() => localStorage.removeItem(key));
  if (__IS_CAPACITOR__ && isNative()) {
    getPrefs()
      .then(({ Preferences }) => Preferences.remove({ key }))
      .catch(() => {});
  }
}

export function readInt(key: string, fallback: number, allowed: number[] | null = null): number {
  track(key);
  if (!browser) return fallback;
  const raw = parseInt(localStorage.getItem(key) ?? '', 10);
  if (Number.isNaN(raw)) return fallback;
  if (allowed && !allowed.includes(raw)) return fallback;
  return raw;
}

export function writeInt(key: string, value: number) {
  track(key);
  if (!browser) return;
  const str = String(value);
  safeLocalStorage(() => localStorage.setItem(key, str));
  mirror(key, str);
}

/**
 * Reconcile the durable Preferences store with localStorage (native only).
 * Restores any key the WebView dropped, and seeds Preferences with any value
 * that only exists in localStorage (e.g. settings saved before this upgrade).
 * Returns true if localStorage was changed, so callers can reload their stores.
 */
export async function hydrateDurableStorage() {
  let restored = false;
  if (__IS_CAPACITOR__ && isNative()) {
    try {
      const { Preferences } = await getPrefs();
      // Fire every durable get concurrently rather than one serial bridge
      // round-trip per key — ~15 keys on the cold-start critical path.
      const keys = [...managedKeys];
      const durable = await Promise.all(keys.map((key) => Preferences.get({ key })));
      const backups: Promise<unknown>[] = [];
      keys.forEach((key, i) => {
        const local = localStorage.getItem(key);
        const { value } = durable[i];
        if (local === null && value !== null) {
          localStorage.setItem(key, value); // WebView lost it — recover from durable store
          restored = true;
        } else if (local !== null && value === null) {
          backups.push(Preferences.set({ key, value: local })); // back up the existing value
        }
      });
      await Promise.all(backups);
    } catch {
      // If the durable layer is unavailable we simply keep the localStorage copy.
    }
  }
  return restored;
}
