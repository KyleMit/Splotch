import { withCredentialLeases } from '../ai/credentialLease';
import { openDatabase, type DBSchema, type IdbDatabase } from '../../../../web/src/lib/idbDatabase';
import { sha256Hex } from '../../../../web/src/lib/digestHex';
import { SECRET_SLOTS, isInstallationId, type CredentialKind } from '../ai/contract';
import {
  validCredential,
  type AiCredential,
  type AiCredentialReference,
  type AiReferencedVault,
  type AiVault,
} from '../ai/credentials';
import {
  AES_BITS,
  IV_BYTES,
  INSTALLATION_SEED_ROW,
  MASTER_KEY_ROW,
  VAULT_DATABASE,
  VAULT_STORE,
  credentialRecord,
  isVaultReference,
  masterKeyRecord,
  randomVaultReference,
  type CredentialRecord,
  type MasterKeyRecord,
} from './aiVaultRecords.web';

interface VaultSchema extends DBSchema {
  vault: { key: string; value: unknown };
}
type VaultDatabase = IdbDatabase<VaultSchema>;
type Snapshot = { master: MasterKeyRecord; credential: CredentialRecord | undefined };

async function readMaster(db: VaultDatabase): Promise<MasterKeyRecord | undefined> {
  const tx = db.transaction(VAULT_STORE, 'readonly');
  const [value] = await Promise.all([tx.store.get(MASTER_KEY_ROW), tx.done]);
  return value === undefined ? undefined : masterKeyRecord(value);
}

async function loadMaster(db: VaultDatabase): Promise<MasterKeyRecord> {
  const existing = await readMaster(db);
  if (existing) return existing;
  const fresh: MasterKeyRecord = {
    version: 1,
    id: randomVaultReference(),
    key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: AES_BITS }, false, [
      'encrypt',
      'decrypt',
    ]),
  };
  const tx = db.transaction(VAULT_STORE, 'readwrite');
  const [winner] = await Promise.all([
    tx.store.get(MASTER_KEY_ROW).then(async (value) => {
      if (value !== undefined) return masterKeyRecord(value);
      const credentials = await Promise.all([
        tx.store.get(SECRET_SLOTS.managed),
        tx.store.get(SECRET_SLOTS.byok),
      ]);
      if (credentials.some((entry) => entry !== undefined)) {
        throw new Error('The browser AI vault key is missing.');
      }
      await tx.store.put(fresh, MASTER_KEY_ROW);
      return fresh;
    }),
    tx.done,
  ]);
  return winner;
}

async function snapshot(db: VaultDatabase, kind: CredentialKind): Promise<Snapshot> {
  const tx = db.transaction(VAULT_STORE, 'readonly');
  const [[key, value]] = await Promise.all([
    Promise.all([tx.store.get(MASTER_KEY_ROW), tx.store.get(SECRET_SLOTS[kind])]),
    tx.done,
  ]);
  const master = masterKeyRecord(key);
  const credential = credentialRecord(value);
  if (credential && credential.keyId !== master.id) {
    throw new Error('The browser AI credential belongs to a different vault key.');
  }
  return { master, credential };
}

function additionalData(kind: CredentialKind, reference: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${SECRET_SLOTS[kind]}:${reference}`);
}

async function decrypt(kind: CredentialKind, state: Snapshot): Promise<string | null> {
  const { credential, master } = state;
  if (!credential || 'removed' in credential) return null;
  const bytes = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: credential.iv,
      additionalData: additionalData(kind, credential.reference),
    },
    master.key,
    credential.data
  );
  const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!validCredential(value)) throw new Error('The browser AI credential is invalid.');
  return value;
}

async function commit(
  db: VaultDatabase,
  kind: CredentialKind,
  expected: Snapshot,
  next: CredentialRecord
): Promise<void> {
  const tx = db.transaction(VAULT_STORE, 'readwrite');
  await Promise.all([
    Promise.all([tx.store.get(MASTER_KEY_ROW), tx.store.get(SECRET_SLOTS[kind])]).then(
      ([key, value]) => {
        const master = masterKeyRecord(key);
        const current = credentialRecord(value);
        if (
          master.id !== expected.master.id ||
          current?.reference !== expected.credential?.reference ||
          (current && current.keyId !== master.id)
        ) {
          throw new Error('The browser AI credential changed during this operation.');
        }
        return tx.store.put(next, SECRET_SLOTS[kind]);
      }
    ),
    tx.done,
  ]);
}

function assertReference(state: Snapshot, reference: string): void {
  if (
    !state.credential ||
    'removed' in state.credential ||
    state.credential.reference !== reference
  ) {
    throw new Error('The saved AI credential was removed or replaced.');
  }
}

async function existingInstallationId(db: VaultDatabase): Promise<string> {
  const tx = db.transaction(VAULT_STORE, 'readonly');
  const [seed] = await Promise.all([tx.store.get(INSTALLATION_SEED_ROW), tx.done]);
  if (!isVaultReference(seed)) throw new Error('The browser installation seed is missing.');
  return sha256Hex(new TextEncoder().encode(`splotch-free-generation-v1:${seed}`));
}
export function createWebAiVault(): AiVault & AiReferencedVault {
  let connection: Promise<VaultDatabase> | null = null;
  const database = (): Promise<VaultDatabase> => {
    if (!connection) {
      const opening = openDatabase<VaultSchema>(VAULT_DATABASE, VAULT_STORE)
        .then((db) => {
          void db.closed.then(() => {
            if (connection === opening) connection = null;
          });
          return db;
        })
        .catch((error: unknown) => {
          if (connection === opening) connection = null;
          throw error;
        });
      connection = opening;
    }
    return connection;
  };
  const installationId = async (): Promise<string> => {
    const db = await database();
    const fresh = randomVaultReference();
    const tx = db.transaction(VAULT_STORE, 'readwrite');
    const [seed] = await Promise.all([
      tx.store.get(INSTALLATION_SEED_ROW).then(async (value) => {
        if (value !== undefined) {
          if (!isVaultReference(value))
            throw new Error('The browser installation seed is invalid.');
          return value;
        }
        await tx.store.put(fresh, INSTALLATION_SEED_ROW);
        return fresh;
      }),
      tx.done,
    ]);
    const id = await sha256Hex(new TextEncoder().encode(`splotch-free-generation-v1:${seed}`));
    if (!isInstallationId(id)) throw new Error('The browser installation ID is invalid.');
    return id;
  };
  const readState = async (
    kind: CredentialKind
  ): Promise<{ db: VaultDatabase; state: Snapshot }> => {
    const db = await database();
    await loadMaster(db);
    return { db, state: await snapshot(db, kind) };
  };
  const mutate = async (kind: CredentialKind, value: string | null): Promise<void> => {
    if (value !== null && !validCredential(value)) throw new Error('The AI credential is invalid.');
    const { db, state } = await readState(kind);
    const reference = randomVaultReference();
    const base = { version: 1 as const, reference, keyId: state.master.id };
    let next: CredentialRecord;
    if (value === null) {
      next = { ...base, removed: true };
    } else {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: additionalData(kind, reference) },
        state.master.key,
        new TextEncoder().encode(value)
      );
      next = { ...base, iv, data };
    }
    await commit(db, kind, state, next);
    const confirmed = await snapshot(db, kind);
    if (
      confirmed.credential?.reference !== reference ||
      (await decrypt(kind, confirmed)) !== value
    ) {
      throw new Error('The browser AI credential change could not be confirmed.');
    }
  };
  return withCredentialLeases({
    installationId,
    read: async (kind) => decrypt(kind, (await readState(kind)).state),
    write: (kind, value) => mutate(kind, value),
    remove: (kind) => mutate(kind, null),
    pin: async (kind): Promise<AiCredentialReference> => {
      if (kind === 'free') return Object.freeze({ kind, reference: await installationId() });
      const { db, state } = await readState(kind);
      if ((await decrypt(kind, state)) === null || !state.credential) {
        throw new Error('There is no saved AI credential.');
      }
      const reference = state.credential.reference;
      assertReference(await snapshot(db, kind), reference);
      return Object.freeze({ kind, reference });
    },
    readReferenced: async (reference): Promise<AiCredential> => {
      if (
        !reference ||
        Object.keys(reference).sort().join(',') !== 'kind,reference' ||
        !['free', 'managed', 'byok'].includes(reference.kind) ||
        !isInstallationId(reference.reference)
      )
        throw new Error('The saved AI credential reference is invalid.');
      if (reference.kind === 'free') {
        const id = await existingInstallationId(await database());
        if (reference.reference !== id) throw new Error('The browser installation changed.');
        return { kind: 'free', installationId: id };
      }
      const db = await database();
      const state = await snapshot(db, reference.kind);
      assertReference(state, reference.reference);
      const value = await decrypt(reference.kind, state);
      assertReference(await snapshot(db, reference.kind), reference.reference);
      if (value === null) throw new Error('There is no saved AI credential.');
      return { kind: reference.kind, value };
    },
  });
}
