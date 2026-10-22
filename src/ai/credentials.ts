import { MAX_CREDENTIAL_CHARACTERS, type CredentialKind } from './contract';
export interface AiVault {
  installationId(): Promise<string>;
  read(kind: CredentialKind): Promise<string | null>;
  write(kind: CredentialKind, value: string): Promise<void>;
  remove(kind: CredentialKind): Promise<void>;
}
export function validCredential(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CREDENTIAL_CHARACTERS &&
    value === value.trim() &&
    ![...value].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
    )
  );
}
// Every character of a saved key but the last four is masked, so a parent can recognise it without
// the whole secret showing (shipping AiKeyManager's maskSecret).
const UNMASKED_TAIL = 4;
export function maskSecret(value: string) {
  if (value.length <= UNMASKED_TAIL) return '*'.repeat(value.length);
  return '*'.repeat(value.length - UNMASKED_TAIL) + value.slice(-UNMASKED_TAIL);
}
export type AiCredential =
  { kind: 'free'; installationId: string } | { kind: CredentialKind; value: string };
export function credentialHeaders(credential: AiCredential): Record<string, string> {
  return credential.kind === 'free'
    ? { 'X-Installation-Id': credential.installationId }
    : credential.kind === 'managed'
      ? { 'X-Access-Token': credential.value }
      : { 'X-Api-Key': credential.value };
}

export type AiCredentialReference = Readonly<{ kind: 'free' | CredentialKind; reference: string }>;
export type AiCredentialLease = Readonly<{ valid: () => boolean }>;
export interface AiReferencedVault {
  lease(): AiCredentialLease;
  pinLeased(
    kind: 'free' | CredentialKind
  ): Promise<Readonly<{ reference: AiCredentialReference; lease: AiCredentialLease }>>;
  pin(kind: 'free' | CredentialKind): Promise<AiCredentialReference>;
  readReferenced(reference: AiCredentialReference): Promise<AiCredential>;
}
