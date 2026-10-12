// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, expectTypeOf, it } from 'vitest';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_TTL_MS,
  RECOVERY_MAX_JSON_BYTES,
  RECOVERY_TERMINAL_HEADER,
  RECOVERY_TERMINAL_VALUE,
  RECOVERY_TERMINAL_STATUS,
  RECOVERY_TERMINAL_CODE,
  parseRecoveryTerminalReply,
  recoveryTerminalRequested,
} from './generationAttempt';
import type {
  RecoveryReadRequest,
  RecoveryAdmissionRequest,
  RecoveryMutationRequest,
} from '../../../../experiments/native-architecture/src/ai/recoveryTransport';
const CREATED = 2_000_000;
const EXPIRES = CREATED + RECOVERY_TTL_MS;
const ID = 'a'.repeat(64);
const expected = {
  id: ID,
  createdAt: CREATED,
  expiry: { kind: 'known', expiresAt: EXPIRES },
} as const;
const body = {
  ok: false,
  error: 'Confirmed failure',
  code: 'RECOVERY_TERMINAL',
  protocol: RECOVERY_PROTOCOL,
  id: ID,
  createdAt: CREATED,
  expiresAt: EXPIRES,
  outcome: 'expired',
} as const;

it('keeps checked request shapes disjoint from legacy reads and ACK', () => {
  expectTypeOf<
    Extract<RecoveryReadRequest, { terminalProof: true }>['recovery']['kind']
  >().toEqualTypeOf<'collect'>();
  expectTypeOf<RecoveryAdmissionRequest['terminalProof']>().toEqualTypeOf<true>();
  expectTypeOf<
    Extract<RecoveryMutationRequest, { terminalProof: true }>['recovery']['kind']
  >().toEqualTypeOf<'reconcile'>();
  expectTypeOf<
    Extract<RecoveryReadRequest, { deliveryProof?: never }>['terminalProof']
  >().toEqualTypeOf<undefined>();
});
it.each(['expired', 'refusal', 'error'] as const)(
  'admits only the finite original tuple for %s',
  (outcome) => {
    const status = RECOVERY_TERMINAL_STATUS[outcome];
    const value = { ...body, outcome };
    const confirmation = parseRecoveryTerminalReply(status, value, expected);
    expect(confirmation).toEqual({ status, body: value });
    expect(Object.isFrozen(confirmation.body)).toBe(true);
  }
);
it.each([
  { protocol: 'old' },
  { id: 'b'.repeat(64) },
  { id: ID.toUpperCase() },
  { createdAt: CREATED + 1 },
  { createdAt: String(CREATED) },
  { expiresAt: EXPIRES + 1 },
  { expiresAt: String(EXPIRES) },
  { expiresAt: Number.MAX_SAFE_INTEGER },
  { outcome: 'acknowledged' },
  { code: 'RECOVERY_EXPIRED' },
  { ok: true },
  { error: '' },
  { extra: true },
])('rejects a forged terminal wire field %j', (change) => {
  expect(() => parseRecoveryTerminalReply(410, { ...body, ...change }, expected)).toThrow();
});
it.each(Object.keys(body))('rejects a missing terminal wire field %s', (field) => {
  const changed: Record<string, unknown> = { ...body };
  delete changed[field];
  expect(() => parseRecoveryTerminalReply(410, changed, expected)).toThrow();
});
it.each([200, 202, 404, 422, 502])('rejects a mismatched expiry proof status %s', (status) => {
  expect(() => parseRecoveryTerminalReply(status, body, expected)).toThrow();
});
it('accepts an unknown expiry only inside the original admission range', () => {
  const unknown = { ...expected, expiry: { kind: 'unknown' } } as const;
  expect(parseRecoveryTerminalReply(410, body, unknown).body.expiresAt).toBe(EXPIRES);
  expect(() =>
    parseRecoveryTerminalReply(410, { ...body, expiresAt: CREATED + 1 }, unknown)
  ).toThrow();
  expect(() =>
    parseRecoveryTerminalReply(410, body, { ...unknown, createdAt: Number.MAX_SAFE_INTEGER })
  ).toThrow();
});
it.each(['0', 'true', '01', '1,1', ''])('rejects a nonexact terminal header %s', (value) => {
  expect(() =>
    recoveryTerminalRequested(new Headers({ [RECOVERY_TERMINAL_HEADER]: value }))
  ).toThrow();
});
it('negotiates only one exact header value without a capability fallback', () => {
  expect(recoveryTerminalRequested(new Headers())).toBe(false);
  expect(
    recoveryTerminalRequested(new Headers({ [RECOVERY_TERMINAL_HEADER]: RECOVERY_TERMINAL_VALUE }))
  ).toBe(true);
});
it('pins both independent native terminal status and JSON cap copies to the shared owner', () => {
  const android = readFileSync(
    new URL(
      '../../../../experiments/native-architecture/android/app/src/main/java/art/splotch/migration/probe/SplotchAIJournal.kt',
      import.meta.url
    ),
    'utf8'
  );
  const apple = readFileSync(
    new URL(
      '../../../../experiments/native-architecture/ios/HelloWorld/SplotchAIJournal.swift',
      import.meta.url
    ),
    'utf8'
  );
  expect(android).toContain(`maxRecoveryJson = ${RECOVERY_MAX_JSON_BYTES}`);
  expect(android).toContain(`body.getString("code") == "${RECOVERY_TERMINAL_CODE}"`);
  expect(apple).toContain(`string(body, "code") == "${RECOVERY_TERMINAL_CODE}"`);
  expect(apple).toContain(`maxRecoveryJson = ${RECOVERY_MAX_JSON_BYTES}`);
  expect(android).toContain(
    `"expired" -> ${RECOVERY_TERMINAL_STATUS.expired}L; "refusal" -> ${RECOVERY_TERMINAL_STATUS.refusal}L; "error" -> ${RECOVERY_TERMINAL_STATUS.error}L`
  );
  expect(apple).toContain(
    `["expired": ${RECOVERY_TERMINAL_STATUS.expired}, "refusal": ${RECOVERY_TERMINAL_STATUS.refusal}, "error": ${RECOVERY_TERMINAL_STATUS.error}]`
  );
});

it('rejects corrupt expected expiry metadata rather than treating it as unknown', () => {
  const corrupt = structuredClone(expected);
  Object.assign(corrupt, { expiry: { kind: 'missing' } });
  expect(() => parseRecoveryTerminalReply(410, body, corrupt)).toThrow();
  Object.assign(corrupt, { expiry: { kind: 'known', expiresAt: String(EXPIRES) } });
  expect(() => parseRecoveryTerminalReply(410, body, corrupt)).toThrow();
});
