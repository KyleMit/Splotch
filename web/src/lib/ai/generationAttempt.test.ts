// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_PATH,
  RECOVERY_VERSION_HEADER,
  RECOVERY_NONCE_HEADER,
  RECOVERY_CREATED_HEADER,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_PHASES,
  RECOVERY_TTL_MS,
  RECOVERY_POLL_AFTER_MS,
  parseRecoveryMutation,
  parseRecoveryTimestamp,
  recoveryCapability,
  recoveryStatus,
  parseRecoveryInput,
  RECOVERY_MAX_PROMPT_BYTES,
  parseRecoveryAdmissionHeaders,
  parseRecoveryLookupHeaders,
  parseRecoveryAckReply,
  RECOVERY_INPUT_DIGEST_HEADER,
} from './generationAttempt';
import {
  parseRecoveryJson,
  recoveryImageMetadata,
} from '../../../../experiments/native-architecture/src/ai/recoveryContract';
import { attemptFixture } from '../server/generationAttemptsTestHarness';

describe('recovery wire compatibility', () => {
  it('pins every established native constant and phase with an independent source drift guard', () => {
    const source = readFileSync(
      new URL(
        '../../../../experiments/native-architecture/src/ai/recoveryContract.ts',
        import.meta.url
      ),
      'utf8'
    );
    const constants = {
      RECOVERY_PROTOCOL,
      RECOVERY_PATH,
      RECOVERY_VERSION_HEADER,
      RECOVERY_NONCE_HEADER,
      RECOVERY_CREATED_HEADER,
      RECOVERY_EXPIRES_HEADER,
      RECOVERY_DIGEST_HEADER,
    };
    for (const [name, value] of Object.entries(constants))
      expect(source).toContain(`export const ${name} = '${value}';`);
    const phases = source
      .match(/const PHASES = \[([\s\S]*?)\] as const;/)?.[1]
      .match(/'[a-z]+'/g)
      ?.map((item) => item.slice(1, -1));
    expect(phases).toEqual(RECOVERY_PHASES);
    expect(source).toContain('const POLL_AFTER_MS = 4_000;');
    expect(recoveryCapability()).toEqual({
      ok: true,
      protocol: 'splotch-ai-recovery-v1',
      jobTtlMs: 1_200_000,
    });
    expect(
      parseRecoveryJson(200, recoveryCapability(), new Headers(), { kind: 'capability' })
    ).toEqual({ kind: 'capability' });
  });
  it('retains the existing exact status body shape', () => {
    expect(recoveryStatus('a'.repeat(64), RECOVERY_TTL_MS, 'image')).toEqual({
      ok: true,
      protocol: RECOVERY_PROTOCOL,
      id: 'a'.repeat(64),
      expiresAt: RECOVERY_TTL_MS,
      phase: 'image',
      pollAfterMs: 4_000,
    });
  });
  it('remains readable by the existing native status and image parsers', () => {
    const f = attemptFixture();
    const expiresAt = f.request.identity.createdAt + RECOVERY_TTL_MS;
    const read = {
      kind: 'collect',
      id: f.lookup.id,
      createdAt: f.lookup.createdAt,
      expiry: { kind: 'unknown' },
    } as const;
    const headers = new Headers({
      [RECOVERY_EXPIRES_HEADER]: String(expiresAt),
      [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
      [RECOVERY_DIGEST_HEADER]: 'd'.repeat(64),
      'Content-Type': 'image/png',
      'X-AI-Delivery-Receipt': 'e'.repeat(64),
    });
    expect(
      parseRecoveryJson(202, recoveryStatus(f.lookup.id, expiresAt, 'delivery'), headers, read)
    ).toEqual({
      kind: 'status',
      id: f.lookup.id,
      expiresAt,
      phase: 'delivery',
      pollAfterMs: RECOVERY_POLL_AFTER_MS,
    });
    expect(recoveryImageMetadata(headers, read)).toEqual({
      mime: 'image/png',
      digest: 'd'.repeat(64),
      expiresAt,
    });
  });
  it('parses only exact declared mutation DTOs', () => {
    const base = { id: 'a'.repeat(64), createdAt: 2_000_000 };
    expect(parseRecoveryMutation({ ...base, operation: 'reconcile' })).toEqual({
      operation: 'reconcile',
      ...base,
    });
    expect(
      parseRecoveryMutation({
        ...base,
        operation: 'ack',
        digest: 'b'.repeat(64),
        receipt: 'c'.repeat(64),
      })
    ).toEqual({ operation: 'ack', ...base, digest: 'b'.repeat(64), receipt: 'c'.repeat(64) });
    expect(() =>
      parseRecoveryMutation({
        ...base,
        operation: 'ack',
        digest: 'B'.repeat(64),
        receipt: 'c'.repeat(64),
      })
    ).toThrow();
    expect(() =>
      parseRecoveryMutation({ ...base, operation: 'reconcile', ignored: true })
    ).toThrow();
    expect(() => parseRecoveryMutation({ ...base, operation: 'start' })).toThrow();
  });
  it.each([null, '', '01', '-1', '0.5', '1e3', '9007199254740992', ' 10'])(
    'rejects noncanonical timestamp %s',
    (value) => {
      expect(() => parseRecoveryTimestamp(value)).toThrow();
    }
  );
  it('accepts only canonical safe-integer timestamps', () => {
    expect(parseRecoveryTimestamp('0')).toBe(0);
    expect(parseRecoveryTimestamp('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('counts UTF-8 prompt bytes and rejects unknown metadata fields', () => {
    const f = attemptFixture();
    expect(parseRecoveryInput(f.request.input)).toEqual(f.request.input);
    expect(() =>
      parseRecoveryInput({ ...f.request.input, prompt: 'é'.repeat(RECOVERY_MAX_PROMPT_BYTES) })
    ).toThrow();
    expect(() => parseRecoveryInput({ ...f.request.input, credential: 'not allowed' })).toThrow();
  });
});

describe('future mutation and lookup validation', () => {
  it('requires complete original lookup headers without URL parameters', () => {
    const headers = new Headers({ [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL });
    expect(parseRecoveryLookupHeaders(headers)).toEqual({ kind: 'capability' });
    headers.set(RECOVERY_NONCE_HEADER, 'a'.repeat(64));
    expect(() => parseRecoveryLookupHeaders(headers)).toThrow();
    headers.set(RECOVERY_CREATED_HEADER, '2000000');
    expect(parseRecoveryLookupHeaders(headers)).toEqual({
      kind: 'collect',
      nonce: 'a'.repeat(64),
      createdAt: 2_000_000,
    });
    headers.set(RECOVERY_INPUT_DIGEST_HEADER, 'b'.repeat(64));
    headers.set('Content-Type', 'image/png');
    expect(parseRecoveryAdmissionHeaders(headers, 'Magical').mime).toBe('image/png');
    expect(() => parseRecoveryAdmissionHeaders(headers, 'UnknownStyle')).toThrow();
  });
  it('requires the exact committed delivery receipt and original expiry in an ACK response', () => {
    const expected = {
      id: 'a'.repeat(64),
      expiresAt: 3_200_000,
      digest: 'b'.repeat(64),
      receipt: 'c'.repeat(64),
    };
    const response = {
      ok: true,
      protocol: RECOVERY_PROTOCOL,
      id: expected.id,
      phase: 'acknowledged',
      expiresAt: expected.expiresAt,
      deliveryDigest: expected.digest,
      deliveryReceipt: expected.receipt,
    };
    expect(parseRecoveryAckReply(response, expected)).toEqual(response);
    expect(() =>
      parseRecoveryAckReply({ ...response, deliveryReceipt: 'd'.repeat(64) }, expected)
    ).toThrow();
    expect(() =>
      parseRecoveryAckReply({ ...response, expiresAt: expected.expiresAt + 1 }, expected)
    ).toThrow();
    expect(() => parseRecoveryAckReply({ ...response, extra: true }, expected)).toThrow();
  });
});
