import { MAX_CREDENTIAL_CHARACTERS, isInstallationId } from '../ai/contract';

export const VAULT_DATABASE = 'splotch-beta-ai-vault-v1';
export const VAULT_STORE = 'vault';
export const MASTER_KEY_ROW = 'master-key';
export const INSTALLATION_SEED_ROW = 'installation-seed';
export const IV_BYTES = 12;
export const AES_BITS = 256;
const GCM_TAG_BYTES = 16;
const MAX_ENCRYPTED_BYTES = MAX_CREDENTIAL_CHARACTERS * 4 + GCM_TAG_BYTES;
const REFERENCE_BYTES = 32;

export function randomVaultReference(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(REFERENCE_BYTES)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export type MasterKeyRecord = { version: 1; id: string; key: CryptoKey };
export type CredentialRecord =
  | { version: 1; reference: string; keyId: string; removed: true }
  | {
      version: 1;
      reference: string;
      keyId: string;
      iv: Uint8Array<ArrayBuffer>;
      data: ArrayBuffer;
    };

export function isVaultReference(value: unknown): value is string {
  return isInstallationId(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function masterKeyRecord(value: unknown): MasterKeyRecord {
  if (
    !record(value) ||
    Object.keys(value).length !== 3 ||
    value.version !== 1 ||
    !isVaultReference(value.id) ||
    !(value.key instanceof CryptoKey) ||
    value.key.type !== 'secret' ||
    value.key.extractable ||
    value.key.algorithm.name !== 'AES-GCM' ||
    !('length' in value.key.algorithm) ||
    value.key.algorithm.length !== AES_BITS ||
    value.key.usages.length !== 2 ||
    !value.key.usages.includes('encrypt') ||
    !value.key.usages.includes('decrypt')
  ) {
    throw new Error('The browser AI vault key is unreadable.');
  }
  return value as MasterKeyRecord;
}

export function credentialRecord(value: unknown): CredentialRecord | undefined {
  if (value === undefined) return undefined;
  if (
    !record(value) ||
    value.version !== 1 ||
    !isVaultReference(value.reference) ||
    !isVaultReference(value.keyId)
  ) {
    throw new Error('The browser AI credential is unreadable.');
  }
  if (value.removed === true && Object.keys(value).length === 4) {
    return value as CredentialRecord;
  }
  if (
    Object.keys(value).length !== 5 ||
    !(value.iv instanceof Uint8Array) ||
    !(value.iv.buffer instanceof ArrayBuffer) ||
    value.iv.length !== IV_BYTES ||
    !(value.data instanceof ArrayBuffer) ||
    value.data.byteLength < GCM_TAG_BYTES ||
    value.data.byteLength > MAX_ENCRYPTED_BYTES
  ) {
    throw new Error('The browser AI credential is unreadable.');
  }
  return value as CredentialRecord;
}
