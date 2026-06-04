import { browser } from '$app/environment';
import { isNative } from './platform.js';

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
const managedKeys = new Set();

function track(key) {
  managedKeys.add(key);
}

// localStorage.setItem can throw — QuotaExceededError when storage is full, or
// SecurityError in locked-down / private-mode WebViews. These run synchronously
// inside every settings setX handler, so an escaping throw would break the toggle
// that triggered it. Swallow the failure (the native durable mirror still backs
// the value up) and warn at most once so we don't spam the console.
let storageWarned = false;
function safeLocalStorage(op) {
  try {
    op();
  } catch (err) {
    if (!storageWarned) {
      storageWarned = true;
      console.warn('localStorage write failed; relying on durable mirror', err);
    }
  }
}

let prefsPromise = null;
function getPrefs() {
  if (!prefsPromise) {
    prefsPromise = import('@capacitor/preferences').then((m) => m.Preferences);
  }
  return prefsPromise;
}

// Fire-and-forget durable mirror. Never throws into the caller — a failed
// durable write just means we fall back to the localStorage copy.
function mirror(key, value) {
  if (!isNative()) return;
  getPrefs()
    .then((Preferences) => Preferences.set({ key, value: String(value) }))
    .catch(() => {});
}

export function readBool(key, fallback) {
  track(key);
  if (!browser) return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

export function writeBool(key, value) {
  track(key);
  if (!browser) return;
  const str = value ? 'true' : 'false';
  safeLocalStorage(() => localStorage.setItem(key, str));
  mirror(key, str);
}

export function readString(key, fallback) {
  track(key);
  if (!browser) return fallback;
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw;
}

export function writeString(key, value) {
  track(key);
  if (!browser) return;
  safeLocalStorage(() => localStorage.setItem(key, value));
  mirror(key, value);
}

// Delete a key from localStorage and, on native, its durable Preferences mirror.
// Used to scrub a value that has moved elsewhere (e.g. a plaintext API key that's
// been migrated into secure storage).
export function removeKey(key) {
  track(key);
  if (!browser) return;
  safeLocalStorage(() => localStorage.removeItem(key));
  if (isNative()) {
    getPrefs()
      .then((Preferences) => Preferences.remove({ key }))
      .catch(() => {});
  }
}

export function readInt(key, fallback, allowed = null) {
  track(key);
  if (!browser) return fallback;
  const raw = parseInt(localStorage.getItem(key), 10);
  if (Number.isNaN(raw)) return fallback;
  if (allowed && !allowed.includes(raw)) return fallback;
  return raw;
}

export function writeInt(key, value) {
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
  if (!isNative()) return false;
  let restored = false;
  try {
    const Preferences = await getPrefs();
    for (const key of managedKeys) {
      const local = localStorage.getItem(key);
      const { value } = await Preferences.get({ key });
      if (local === null && value !== null) {
        localStorage.setItem(key, value); // WebView lost it — recover from durable store
        restored = true;
      } else if (local !== null && value === null) {
        await Preferences.set({ key, value: local }); // back up the existing value
      }
    }
  } catch {
    // If the durable layer is unavailable we simply keep the localStorage copy.
  }
  return restored;
}
