import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const FIXTURE_PATH = '/legacy-continuity.html';
const FIXTURE_OWNER_KEY = 'splotch-l0-owner';
const UNRELATED_SENTINEL_KEY = 'splotch-l0-unrelated';
const HELD_UNDEFINED_OWNER_KEY = 'splotch-l0-held-undefined-owner';
export const FIXTURE_DEBUG_SIGNING = Object.freeze({
  propertiesName: '.splotch-l0-debug-signing.properties',
  keystoreName: '.splotch-l0-debug.keystore',
  alias: 'splotch-l0-owned',
});
const NATIVE_SECURE_PREFIX = 'capacitor-storage_';
const NATIVE_PREFERENCES_GROUP = 'CapacitorStorage';
const NATIVE_VAULT_PREFERENCES = 'WSSecureStorageSharedPreferences';
export const SOURCE_REVISIONS = Object.freeze({
  released: 'd8b86469f63c57a06a9de45664a42eea15b99eb0',
  held: 'ef3d1eb2070c1bd0dee620ed42a2b14201c2a9b4',
  reader: '78d844ce36845e13690e2ca4ee7fcd645eb128d0',
});
export const FIXTURE_COMMANDS = Object.freeze([
  'raw',
  'seed',
  'parse',
  'disk',
  'preferences',
  'hydrate',
  'evict-local',
  'native-wrong-type',
  'invalid-theme',
  'noncanonical-volume',
  'restore-settings',
  'vault-read',
  'vault-absent',
  'restore-vault',
  'vault-nonstring',
  'vault-date',
  'vault-invalid-json',
  'vault-cipher-corrupt',
  'vault-orphan-alias',
  'vault-query-refusal',
  'held-seed',
  'held-read',
  'held-false-hint',
  'held-missing-hint',
  'held-undefined',
  'held-restore-undefined',
  'cleanup',
]);

export function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertNonce(nonce) {
  assert.match(nonce, /^[a-f0-9]{32}$/, 'L0_NONCE_INVALID');
}

export function replaceOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, `L0_OWNER_ANCHOR_CHANGED: ${needle}`);
  return source.replace(needle, replacement);
}

function sourceLiteral(source, name) {
  const matches = [
    ...source.matchAll(new RegExp(`(?:^|\\n)\\s*(?:const\\s+)?${name}\\s*[:=]\\s*'([^']+)'`, 'g')),
  ];
  assert.equal(matches.length, 1, `L0_OWNER_LITERAL_CHANGED: ${name}`);
  return matches[0][1];
}

export function exposeHeldRecognizer(source) {
  return replaceOnce(
    source,
    'function isStoredPicture(value: unknown): value is StoredPicture {',
    'export function isStoredPicture(value: unknown): value is StoredPicture {'
  );
}

export function heldNamespaceConfiguration(source) {
  return {
    database: sourceLiteral(source, 'DB_NAME'),
    store: sourceLiteral(source, 'STORE'),
    key: sourceLiteral(source, 'HELD_KEY'),
  };
}

export function sourceConfiguration(role, storageKeys, secureStorage, releasedStorageKeys) {
  assert.ok(Object.hasOwn(SOURCE_REVISIONS, role), 'L0_SOURCE_ROLE_INVALID');
  const drawerProperty = role === 'released' ? 'advancedControls' : 'toolDrawer';
  const propertyNames = [
    'soundEnabled',
    'soundVolume',
    'theme',
    drawerProperty,
    'coloringBookEnabled',
    'aiImageEnabled',
  ];
  const keys = Object.fromEntries(
    propertyNames.map((name) => [name, sourceLiteral(storageKeys, name)])
  );
  const legacyDrawerKey = sourceLiteral(releasedStorageKeys, 'advancedControls');
  const extraKeys =
    role === 'released'
      ? []
      : ['pendingDurableRemovals', 'unsavedPicturesHeld'].map((name) =>
          sourceLiteral(storageKeys, name)
        );
  const secretNames = ['API_KEY', 'MANAGED_ACCESS_CODE'].map((name) =>
    sourceLiteral(secureStorage, name)
  );
  return {
    role,
    revision: SOURCE_REVISIONS[role],
    path: FIXTURE_PATH,
    ownerKey: FIXTURE_OWNER_KEY,
    unrelatedKey: UNRELATED_SENTINEL_KEY,
    heldUndefinedOwnerKey: HELD_UNDEFINED_OWNER_KEY,
    keys,
    legacyDrawerKey,
    extraKeys,
    drawerProperty,
    secretNames,
    securePrefix: NATIVE_SECURE_PREFIX,
    preferencesGroup: NATIVE_PREFERENCES_GROUP,
    vaultPreferences: NATIVE_VAULT_PREFERENCES,
    commands: FIXTURE_COMMANDS,
    observedKeys: [
      ...new Set([
        ...Object.values(keys),
        legacyDrawerKey,
        ...extraKeys,
        FIXTURE_OWNER_KEY,
        UNRELATED_SENTINEL_KEY,
        HELD_UNDEFINED_OWNER_KEY,
      ]),
    ],
    vaultAccounts: secretNames.map((name) => NATIVE_SECURE_PREFIX + name),
  };
}
