import { browser } from '$app/environment';
import { isNative } from './platform';

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

// --- native plugin (lazy so it's never loaded on the web or during SSR) ---
type SecureStoragePlugin = (typeof import('@aparajita/capacitor-secure-storage'))['SecureStorage'];

let pluginPromise: Promise<SecureStoragePlugin> | null = null;
function getPlugin(): Promise<SecureStoragePlugin> {
  if (!pluginPromise) {
    pluginPromise = import('@aparajita/capacitor-secure-storage').then((m) => m.SecureStorage);
  }
  return pluginPromise;
}

// --- web: IndexedDB via idb (also lazy) ---
let dbPromise: Promise<import('idb').IDBPDatabase> | null = null;
function getDb(): Promise<import('idb').IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = import('idb').then(({ openDB }) =>
      openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        }
      })
    );
  }
  return dbPromise;
}

// Get (or lazily create) the persistent, non-extractable master key. Because it
// can never be exported, code that reads IndexedDB can't lift the raw bytes out —
// it can only ask the browser to decrypt, within this origin.
async function getMasterKey(db: import('idb').IDBPDatabase): Promise<CryptoKey> {
  const existing = await db.get(STORE, MASTER_KEY_ROW);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt'
  ]);
  await db.put(STORE, key, MASTER_KEY_ROW);
  return key;
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
  await db.put(STORE, { iv, data }, name);
}

async function webLoad(name: string) {
  const db = await getDb();
  const record = await db.get(STORE, name);
  if (!record) return null;
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

/** Persist a named secret to the platform's secure store. */
async function saveSecret(name: string, value: string) {
  if (!browser || !value) return;
  if (isNative()) {
    const SecureStorage = await getPlugin();
    await SecureStorage.set(name, value);
  } else {
    await webSave(name, value);
  }
}

/** Read a named secret back, or null if none is stored. Never throws. */
async function loadSecret(name: string) {
  if (!browser) return null;
  try {
    if (isNative()) {
      const SecureStorage = await getPlugin();
      const value = await SecureStorage.get(name);
      return typeof value === 'string' ? value : null;
    }
    return await webLoad(name);
  } catch {
    return null;
  }
}

/** Remove a named secret. Best-effort; never throws. */
async function clearSecret(name: string) {
  if (!browser) return;
  try {
    if (isNative()) {
      const SecureStorage = await getPlugin();
      await SecureStorage.remove(name);
    } else {
      await webClear(name);
    }
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
