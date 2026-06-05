import { browser } from '$app/environment';
import { isNative } from './platform';

// Secure home for the parent's Gemini API key.
//
//  • Native (iOS/Android): the key is handed to @aparajita/capacitor-secure-storage,
//    which stores it in the iOS Keychain / Android Keystore — hardware-backed and
//    persistent until the app is deleted.
//
//  • Web: there's no hardware vault, so the next best thing — the raw key is never
//    written in plaintext. It's AES-GCM encrypted with a *non-extractable* CryptoKey
//    that the browser sandboxes inside IndexedDB: its raw bytes can't be exported or
//    exfiltrated, only used to decrypt within this exact origin. Only the ciphertext
//    and IV are persisted. This is transparent on boot (no passphrase/prompt), which
//    keeps setup a one-time, "set and forget" step for parents.

const NATIVE_KEY = 'gemini-api-key';

// IndexedDB layout for the web path.
const DB_NAME = 'splotch-secure';
const DB_VERSION = 1;
const STORE = 'secrets';
const MASTER_KEY_ROW = 'master-key'; // the non-extractable AES-GCM CryptoKey
const PAYLOAD_ROW = 'gemini-api-key'; // { iv, data }

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

async function webSave(value: string) {
  const db = await getDb();
  const key = await getMasterKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  await db.put(STORE, { iv, data }, PAYLOAD_ROW);
}

async function webLoad() {
  const db = await getDb();
  const record = await db.get(STORE, PAYLOAD_ROW);
  if (!record) return null;
  const key = await getMasterKey(db);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.data);
    return new TextDecoder().decode(plain);
  } catch {
    return null; // master key missing/rotated or payload corrupt — treat as no key
  }
}

async function webClear() {
  const db = await getDb();
  await db.delete(STORE, PAYLOAD_ROW);
  // The master key is left in place: it's useless without a payload and lets a
  // re-entered key reuse the same sandboxed key object.
}

/** Persist the parent's API key to the platform's secure store. */
export async function saveApiKey(value: string) {
  if (!browser || !value) return;
  if (isNative()) {
    const SecureStorage = await getPlugin();
    await SecureStorage.set(NATIVE_KEY, value);
  } else {
    await webSave(value);
  }
}

/** Read the saved API key back, or null if none is stored. Never throws. */
export async function loadApiKey() {
  if (!browser) return null;
  try {
    if (isNative()) {
      const SecureStorage = await getPlugin();
      const value = await SecureStorage.get(NATIVE_KEY);
      return typeof value === 'string' ? value : null;
    }
    return await webLoad();
  } catch {
    return null;
  }
}

/** Remove the saved API key. Best-effort; never throws. */
export async function clearApiKey() {
  if (!browser) return;
  try {
    if (isNative()) {
      const SecureStorage = await getPlugin();
      await SecureStorage.remove(NATIVE_KEY);
    } else {
      await webClear();
    }
  } catch {
    // best-effort
  }
}

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
