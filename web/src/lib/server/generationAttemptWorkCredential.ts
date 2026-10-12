import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import {
  type RECOVERY_PROTOCOL,
  RecoveryFault,
  recoveryExact,
  recoveryObject,
} from '../ai/generationAttempt';
import {
  type RECOVERY_WORK_DOMAIN,
  RECOVERY_MAX_CREDENTIAL_BYTES,
  RECOVERY_WORK_CREDENTIAL_DOMAIN,
  RECOVERY_WORK_CREDENTIAL_VERSION,
} from './generationAttemptPolicy';
export type RecoveryCredentialContext = Readonly<{
  domain: typeof RECOVERY_WORK_DOMAIN;
  protocol: typeof RECOVERY_PROTOCOL;
  id: string;
  createdAt: number;
  issuedAt: number;
  expiresAt: number;
  requestFingerprint: string;
  kind: 'free' | 'managed' | 'byok';
}>;
const CREDENTIAL_NONCE_BYTES = 12;
const CREDENTIAL_TAG_BYTES = 16;
const CREDENTIAL_KEY_BYTES = 32;
function credentialKey(secret: string): Buffer {
  if (!secret) throw new RecoveryFault('RECOVERY_UNAVAILABLE');
  return Buffer.from(
    hkdfSync(
      'sha256',
      secret,
      Buffer.alloc(0),
      RECOVERY_WORK_CREDENTIAL_DOMAIN,
      CREDENTIAL_KEY_BYTES
    )
  );
}
function credentialContext(context: RecoveryCredentialContext): Buffer {
  return Buffer.from(
    JSON.stringify([
      RECOVERY_WORK_CREDENTIAL_DOMAIN,
      context.domain,
      context.protocol,
      context.id,
      context.createdAt,
      context.issuedAt,
      context.expiresAt,
      context.requestFingerprint,
      context.kind,
    ])
  );
}
function canonicalBytes(value: unknown, maxBytes: number, exactBytes?: number): Buffer {
  const maxEncodedBytes = Math.ceil((maxBytes * 4) / 3);
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > maxEncodedBytes ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw new RecoveryFault('RECOVERY_INVALID');
  const decoded = Buffer.from(value, 'base64url');
  if (
    decoded.toString('base64url') !== value ||
    !decoded.byteLength ||
    decoded.byteLength > maxBytes ||
    (exactBytes !== undefined && decoded.byteLength !== exactBytes)
  )
    throw new RecoveryFault('RECOVERY_INVALID');
  return decoded;
}
export function sealRecoveryCredential(
  identity: string,
  context: RecoveryCredentialContext,
  secret: string
) {
  const bytes = Buffer.from(identity);
  if (!bytes.byteLength || bytes.byteLength > RECOVERY_MAX_CREDENTIAL_BYTES)
    throw new RecoveryFault('RECOVERY_INVALID');
  const nonce = randomBytes(CREDENTIAL_NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', credentialKey(secret), nonce, {
    authTagLength: CREDENTIAL_TAG_BYTES,
  });
  cipher.setAAD(credentialContext(context));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    version: RECOVERY_WORK_CREDENTIAL_VERSION,
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}
export function openRecoveryCredential(
  value: unknown,
  context: RecoveryCredentialContext,
  secret: string
): string {
  const sealed = recoveryObject(value);
  recoveryExact(sealed, ['version', 'nonce', 'ciphertext', 'tag']);
  if (sealed.version !== RECOVERY_WORK_CREDENTIAL_VERSION)
    throw new RecoveryFault('RECOVERY_INVALID');
  const nonce = canonicalBytes(sealed.nonce, CREDENTIAL_NONCE_BYTES, CREDENTIAL_NONCE_BYTES);
  const tag = canonicalBytes(sealed.tag, CREDENTIAL_TAG_BYTES, CREDENTIAL_TAG_BYTES);
  const ciphertext = canonicalBytes(sealed.ciphertext, RECOVERY_MAX_CREDENTIAL_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', credentialKey(secret), nonce, {
      authTagLength: CREDENTIAL_TAG_BYTES,
    });
    decipher.setAAD(credentialContext(context));
    decipher.setAuthTag(tag);
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat([decipher.update(ciphertext), decipher.final()])
    );
  } catch {
    throw new RecoveryFault('RECOVERY_INVALID');
  }
}
