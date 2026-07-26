import type { DBSchema, IDBPDatabase } from 'idb';
import { browser } from '$app/environment';
import { isNative } from './platform';
import { lazyPluginModule } from './nativePlugin';
import { lazyIdbDatabase } from './idb';

// Secure home for the app's client-held secrets — the parent's Gemini API key
// and the admin session token (used by the native apps to authenticate against
// /api/admin/*).
//
//  • Native (iOS/Android): secrets are handed to @aparajita/capacitor-secure-storage,
//    which stores them in the iOS Keychain / Android Keystore — hardware-backed and
//    persistent until the app is deleted.
//
//  • Web: there's no hardware vault, so the next best thing — the raw value is never
//    written in plaintext. It's AES-GCM encrypted with a *non-extractable* CryptoKey
//    that the browser sandboxes inside IndexedDB: its raw bytes can't be exported or
//    exfiltrated, only used to decrypt within this exact origin. Only the ciphertext
//    and IV are persisted. This is transparent on boot (no passphrase/prompt), which
//    keeps setup a one-time, "set and forget" step for parents.

// Each secret has a stable name that doubles as the native store key and the
// IndexedDB row key for its { iv, data } payload on the web.
const API_KEY = 'gemini-api-key';
const ADMIN_SESSION = 'admin-session';

// IndexedDB layout for the web path.
const DB_NAME = 'splotch-secure';
const DB_VERSION = 1;
const STORE = 'secrets';
const MASTER_KEY_ROW = 'master-key'; // the non-extractable AES-GCM CryptoKey

type SecretPayload = {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
};

interface SecureDb extends DBSchema {
  secrets: {
    key: string;
    value: CryptoKey | SecretPayload;
  };
}

// Native plugin, loaded lazily so it's never pulled in on the web or during SSR.
// Returns the module namespace, not the SecureStorage proxy — see
// lazyPluginModule for why that distinction is load-bearing.
// The __IS_CAPACITOR__ ternary keeps the import() itself out of the web bundle
// (Rollup retains the thunk even when every caller is dead code); the reject arm
// is unreachable because every call site is gated on __IS_CAPACITOR__ too.
const getPlugin = lazyPluginModule(() =>
  __IS_CAPACITOR__
    ? import('@aparajita/capacitor-secure-storage')
    : Promise.reject(new Error('native-only plugin'))
);

// --- web: IndexedDB via idb (also lazy) ---
const getDb = lazyIdbDatabase<SecureDb>(DB_NAME, STORE, DB_VERSION);

function isSecretPayload(value: unknown): value is SecretPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'iv' in value &&
    value.iv instanceof Uint8Array &&
    value.iv.buffer instanceof ArrayBuffer &&
    'data' in value &&
    value.data instanceof ArrayBuffer
  );
}

// Get (or lazily create) the persistent, non-extractable master key. Because it
// can never be exported, code that reads IndexedDB can't lift the raw bytes out —
// it can only ask the browser to decrypt, within this origin.
//
// Creation must never lose a race: a second writer overwriting the row with a
// different key would make anything encrypted with the first key permanently
// undecryptable. In-tab, the memoized promise makes concurrent callers share
// one key (cleared on rejection so a transient IDB failure doesn't poison
// future calls). Cross-tab, the re-check-then-put runs inside one readwrite
// transaction, so a tab that loses the race adopts the winner's key.
let masterKeyPromise: Promise<CryptoKey> | null = null;

function getMasterKey(db: IDBPDatabase<SecureDb>): Promise<CryptoKey> {
  masterKeyPromise ??= loadOrCreateMasterKey(db).catch((err) => {
    masterKeyPromise = null;
    throw err;
  });
  return masterKeyPromise;
}

async function loadOrCreateMasterKey(db: IDBPDatabase<SecureDb>): Promise<CryptoKey> {
  const existing = await db.get(STORE, MASTER_KEY_ROW);
  if (existing && !isSecretPayload(existing)) return existing;
  // Generated *before* the transaction: an IDB transaction auto-commits once
  // control returns to the event loop with no pending requests, so awaiting
  // crypto.subtle.generateKey inside it would leave the transaction closed by
  // the time the put runs.
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const tx = db.transaction(STORE, 'readwrite');
  const winner = await tx.store.get(MASTER_KEY_ROW);
  const winningKey = winner && !isSecretPayload(winner) ? winner : null;
  if (!winningKey) await tx.store.put(fresh, MASTER_KEY_ROW);
  await tx.done;
  return winningKey ?? fresh;
}

async function webSave(name: string, value: string) {
  const db = await getDb();
  const key = await getMasterKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  const payload: SecretPayload = { iv, data };
  await db.put(STORE, payload, name);
}

async function webLoad(name: string) {
  const db = await getDb();
  const record = await db.get(STORE, name);
  if (!isSecretPayload(record)) return null;
  const key = await getMasterKey(db);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.data);
    return new TextDecoder().decode(plain);
  } catch {
    return null; // master key missing/rotated or payload corrupt — treat as no value
  }
}

async function webClear(name: string) {
  const db = await getDb();
  await db.delete(STORE, name);
  // The master key is left in place: it's useless without a payload and lets a
  // re-entered secret reuse the same sandboxed key object.
}

interface SecureBackend {
  save(name: string, value: string): Promise<void>;
  load(name: string): Promise<string | null>;
  clear(name: string): Promise<void>;
}

// The literal __IS_CAPACITOR__ guard makes the native path compile-time dead
// on web so Rollup drops the secure-storage plugin chunk; isNative() alone is
// a runtime check it can't tree-shake.
async function selectBackend(): Promise<SecureBackend> {
  if (__IS_CAPACITOR__ && isNative()) {
    const { SecureStorage } = await getPlugin();
    return {
      save: (name, value) => SecureStorage.set(name, value),
      load: async (name) => {
        const value = await SecureStorage.get(name);
        return typeof value === 'string' ? value : null;
      },
      clear: async (name) => {
        await SecureStorage.remove(name);
      },
    };
  }
  return { save: webSave, load: webLoad, clear: webClear };
}

/** Persist a named secret to the platform's secure store. */
async function saveSecret(name: string, value: string) {
  if (!browser || !value) return;
  const backend = await selectBackend();
  await backend.save(name, value);
}

/** Read a named secret back, or null if none is stored. Never throws. */
async function loadSecret(name: string) {
  if (!browser) return null;
  try {
    const backend = await selectBackend();
    return await backend.load(name);
  } catch {
    return null;
  }
}

/** Remove a named secret. Best-effort; never throws. */
async function clearSecret(name: string) {
  if (!browser) return;
  try {
    const backend = await selectBackend();
    await backend.clear(name);
  } catch {
    // best-effort
  }
}

// The parent's Gemini API key.
export const saveApiKey = (value: string) => saveSecret(API_KEY, value);
export const loadApiKey = () => loadSecret(API_KEY);
export const clearApiKey = () => clearSecret(API_KEY);

// The derived admin session token (never the raw admin secret), returned by
// POST /api/admin/login and replayed as a bearer header by the admin console.
export const saveAdminSession = (value: string) => saveSecret(ADMIN_SESSION, value);
export const loadAdminSession = () => loadSecret(ADMIN_SESSION);
export const clearAdminSession = () => clearSecret(ADMIN_SESSION);

// Ask the browser not to evict our IndexedDB during low-storage cleanups, so the
// key survives across sessions without the parent ever re-entering it. Web only.
export async function requestPersistentStorage() {
  if (!browser || isNative()) return false;
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // ignore — persistence is a best-effort nicety
  }
  return false;
}
