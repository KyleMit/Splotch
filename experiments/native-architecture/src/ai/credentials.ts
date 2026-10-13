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
export interface AiReferencedVault {
  pin(kind: 'free' | CredentialKind): Promise<AiCredentialReference>;
  readReferenced(reference: AiCredentialReference): Promise<AiCredential>;
}
