import type { DBSchema } from 'idb';
import { browser } from '$app/environment';
import { isNative } from '$lib/platform';
import { lazyPluginModule } from './nativePlugin';
import { idbKvStore, lazyIdbDatabase } from './idb';

// Secure home for the app's client-held secrets — the parent's AI provider API
// key (BYOK) and managed access code.
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
//
// This one names the vendor the app used when the row was first written, and it
// stays that way: it is the address of a secret already sitting in a parent's
// Keychain / Keystore / IndexedDB, so renaming it orphans their saved key on
// every device that has one and silently signs them out of AI. The vendor name
// here is a historical string, not a claim about which provider runs today.
const API_KEY = 'gemini-api-key';
const MANAGED_ACCESS_CODE = 'managed-access-code';

// IndexedDB layout for the web path.
const DB_NAME = 'splotch-secure';
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

interface SecretPayloadDb extends DBSchema {
  secrets: {
    key: string;
    value: SecretPayload;
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
const getDb = lazyIdbDatabase<SecureDb>(DB_NAME, STORE);
// This views SecureDb's physical store only through named secret-payload rows: webSave, webLoad,
// and webClear receive the secret name, while MASTER_KEY_ROW stays exclusively on getDb. webLoad
// still validates persisted data, and the narrow put type prevents payload-path writes of CryptoKey.
const payloadStore = idbKvStore<SecretPayloadDb>(DB_NAME, STORE);

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

function getMasterKey(): Promise<CryptoKey> {
  masterKeyPromise ??= loadOrCreateMasterKey().catch((err) => {
    masterKeyPromise = null;
    throw err;
  });
  return masterKeyPromise;
}

async function loadOrCreateMasterKey(): Promise<CryptoKey> {
  const db = await getDb();
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
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  const payload: SecretPayload = { iv, data };
  await payloadStore.put(name, payload);
}

async function webLoad(name: string) {
  const record = await payloadStore.get(name);
  if (record === undefined) return null;
  if (!isSecretPayload(record)) throw new Error('Malformed secure-storage payload');
  const key = await getMasterKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.data);
  return new TextDecoder().decode(plain);
}

async function webClear(name: string) {
  await payloadStore.delete(name);
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
  if (!browser) return;
  if (!value) return clearSecret(name);
  const backend = await selectBackend();
  await backend.save(name, value);
}

/** Read a named secret back, or null if none is stored. Never throws. */
async function loadSecret(name: string) {
  if (!browser) return null;
  try {
    const backend = await selectBackend();
    return await backend.load(name);
  } catch (err) {
    console.warn('Secure storage load failed', err);
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

// The parent's own AI provider API key (BYOK).
export const saveApiKey = (value: string) => saveSecret(API_KEY, value);
export const loadApiKey = () => loadSecret(API_KEY);
export const clearApiKey = () => clearSecret(API_KEY);

// The managed code that grants access to Splotch's server-funded AI quota.
export const saveAccessCode = (value: string) => saveSecret(MANAGED_ACCESS_CODE, value);
export const loadAccessCode = () => loadSecret(MANAGED_ACCESS_CODE);
export const clearAccessCode = () => clearSecret(MANAGED_ACCESS_CODE);
