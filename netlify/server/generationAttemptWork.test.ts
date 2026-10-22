// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RECOVERY_PROTOCOL } from '../../src/lib/ai/generationAttempt';
import {
  RECOVERY_MAX_CREDENTIAL_BYTES,
  RECOVERY_WORK_DOMAIN,
  RECOVERY_WORK_MAX_BYTES,
} from './generationAttemptPolicy';
import {
  openRecoveryWork,
  sealRecoveryWork,
  signRecoveryWork,
  verifyRecoveryWork,
  type RecoveryWork,
} from './generationAttemptWork';
const NOW = Date.parse('2026-10-12T12:00:00.000Z');
const SECRET = 'fixture-report-secret';
const CREDENTIAL = 'fixture-byok-key-kept-only-in-memory';
const work: RecoveryWork = {
  domain: RECOVERY_WORK_DOMAIN,
  protocol: RECOVERY_PROTOCOL,
  id: 'a'.repeat(64),
  createdAt: NOW,
  issuedAt: NOW,
  expiresAt: NOW + 20 * 60 * 1_000,
  requestFingerprint: 'b'.repeat(64),
  credential: { kind: 'byok', identity: CREDENTIAL },
};
function changeEnvelope(raw: string, change: (value: Record<string, unknown>) => void): string {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Fixture envelope malformed');
  change(value as Record<string, unknown>);
  return JSON.stringify(value);
}
function changeSealed(raw: string, field: string, value: unknown): string {
  return changeEnvelope(raw, (envelope) => {
    const credential = envelope.credential as Record<string, unknown>;
    const sealed = credential.sealed as Record<string, unknown>;
    sealed[field] = value;
  });
}
describe('encrypted bounded recovery work credential', () => {
  it('round-trips the original credential without including its plaintext in the invocation body', () => {
    const raw = sealRecoveryWork(work, SECRET);
    expect(raw).not.toContain(CREDENTIAL);
    expect(raw).not.toContain(SECRET);
    expect(openRecoveryWork(raw, SECRET, NOW)).toEqual(work);
    expect(verifyRecoveryWork(raw, signRecoveryWork(raw, SECRET), SECRET)).toBe(true);
  });
  it('uses a fresh authenticated-encryption nonce for each dispatch of the same admission', () => {
    const first = sealRecoveryWork(work, SECRET);
    const second = sealRecoveryWork(work, SECRET);
    expect(first).not.toBe(second);
    expect(openRecoveryWork(first, SECRET, NOW)).toEqual(openRecoveryWork(second, SECRET, NOW));
  });
  it('rejects the wrong existing report secret and absent signing material', () => {
    const raw = sealRecoveryWork(work, SECRET);
    expect(() => openRecoveryWork(raw, 'wrong-fixture-secret', NOW)).toThrow();
    expect(() => sealRecoveryWork(work, '')).toThrow();
    expect(signRecoveryWork(raw, undefined)).toBeNull();
    expect(verifyRecoveryWork(raw, signRecoveryWork(raw, SECRET), 'wrong-fixture-secret')).toBe(
      false
    );
  });
  it.each(['id', 'requestFingerprint', 'createdAt', 'issuedAt', 'expiresAt'])(
    'binds immutable %s in authenticated data',
    (field) => {
      const changed = changeEnvelope(sealRecoveryWork(work, SECRET), (envelope) => {
        envelope[field] =
          typeof envelope[field] === 'number' ? Number(envelope[field]) + 1 : 'c'.repeat(64);
      });
      expect(() => openRecoveryWork(changed, SECRET, NOW)).toThrow();
    }
  );
  it('binds the worker domain, protocol and credential kind', () => {
    const raw = sealRecoveryWork(work, SECRET);
    expect(() =>
      openRecoveryWork(
        changeEnvelope(raw, (value) => {
          value.domain = 'other-worker-domain';
        }),
        SECRET,
        NOW
      )
    ).toThrow();
    expect(() =>
      openRecoveryWork(
        changeEnvelope(raw, (value) => {
          value.protocol = 'other-version';
        }),
        SECRET,
        NOW
      )
    ).toThrow();
    const changed = changeEnvelope(raw, (value) => {
      (value.credential as Record<string, unknown>).kind = 'managed';
    });
    expect(() => openRecoveryWork(changed, SECRET, NOW)).toThrow();
  });
  it.each(['nonce', 'tag', 'ciphertext'])(
    'rejects authenticated-encryption %s tampering',
    (field) => {
      const raw = sealRecoveryWork(work, SECRET);
      const changed = changeEnvelope(raw, (value) => {
        const sealed = (value.credential as Record<string, unknown>).sealed as Record<
          string,
          unknown
        >;
        const original = String(sealed[field]);
        sealed[field] = `${original[0] === 'A' ? 'B' : 'A'}${original.slice(1)}`;
      });
      expect(() => openRecoveryWork(changed, SECRET, NOW)).toThrow();
    }
  );
  it('rejects noncanonical and unknown credential encodings', () => {
    const raw = sealRecoveryWork(work, SECRET);
    expect(() => openRecoveryWork(` ${raw}`, SECRET, NOW)).toThrow();
    expect(() =>
      openRecoveryWork(changeSealed(raw, 'version', 'other-version'), SECRET, NOW)
    ).toThrow();
    expect(() =>
      openRecoveryWork(changeSealed(raw, 'nonce', 'A'.repeat(16) + '='), SECRET, NOW)
    ).toThrow();
    expect(() =>
      openRecoveryWork(changeSealed(raw, 'plaintext', CREDENTIAL), SECRET, NOW)
    ).toThrow();
    const legacy = JSON.stringify(work);
    expect(() => openRecoveryWork(legacy, SECRET, NOW)).toThrow();
  });
  it('bounds plaintext, ciphertext, full envelopes and exact nonce/tag lengths before claim', () => {
    const maximum = {
      ...work,
      credential: { kind: 'byok' as const, identity: 'x'.repeat(RECOVERY_MAX_CREDENTIAL_BYTES) },
    };
    const raw = sealRecoveryWork(maximum, SECRET);
    expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(RECOVERY_WORK_MAX_BYTES);
    expect(openRecoveryWork(raw, SECRET, NOW)).toEqual(maximum);
    expect(() =>
      sealRecoveryWork(
        {
          ...maximum,
          credential: { ...maximum.credential, identity: maximum.credential.identity + 'x' },
        },
        SECRET
      )
    ).toThrow();
    expect(() => openRecoveryWork('x'.repeat(RECOVERY_WORK_MAX_BYTES + 1), SECRET, NOW)).toThrow();
    const oversized = Buffer.alloc(RECOVERY_MAX_CREDENTIAL_BYTES + 1).toString('base64url');
    expect(() =>
      openRecoveryWork(changeSealed(raw, 'ciphertext', oversized), SECRET, NOW)
    ).toThrow();
    expect(() => openRecoveryWork(changeSealed(raw, 'nonce', 'AAAA'), SECRET, NOW)).toThrow();
    expect(() => openRecoveryWork(changeSealed(raw, 'tag', 'AAAA'), SECRET, NOW)).toThrow();
  });
});
