import { REPORT_TOKEN_HEADER as HOSTED_REPORT_TOKEN_HEADER } from '../../web/src/lib/apiHeaders.ts';
import { RECOVERY_POLL_AFTER_MS } from '../../web/src/lib/ai/generationAttempt.ts';
import { JOB_TTL_MS } from '../../experiments/native-architecture/src/ai/contract.ts';
import { expect, it } from 'vitest';
import { parseAiResponse } from '../../experiments/native-architecture/src/ai/transport.ts';
import {
  RECOVERY_PATH,
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
  RECOVERY_TERMINAL_HEADER,
  RECOVERY_TERMINAL_VALUE,
} from '../../experiments/native-architecture/src/ai/recoveryContract.ts';
import { recoveryDigest } from '../../experiments/native-architecture/src/ai/recoveryDigest.ts';
import {
  MAX_AI_REPORT_TOKEN_CHARACTERS,
  REPORT_TOKEN_HEADER,
} from '../../experiments/native-architecture/src/ai/reportContract.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
const CREATED = 1700000000000;
const EXPIRES = CREATED + JOB_TTL_MS;
const ID = 'a'.repeat(64);
const TOKEN = 'opaque.checked-refusal';
const BYTES = new Uint8Array(rgbaPng(2, 2, 255));
const collect = {
  path: RECOVERY_PATH,
  method: 'GET',
  deliveryProof: true,
  terminalProof: true,
  headers: { [RECOVERY_TERMINAL_HEADER]: RECOVERY_TERMINAL_VALUE },
  recovery: {
    kind: 'collect',
    id: ID,
    createdAt: CREATED,
    expiry: { kind: 'known', expiresAt: EXPIRES },
  },
};
const reconcile = {
  path: RECOVERY_PATH,
  method: 'POST',
  terminalProof: true,
  headers: { [RECOVERY_TERMINAL_HEADER]: RECOVERY_TERMINAL_VALUE },
  body: JSON.stringify({ operation: 'reconcile', id: ID, createdAt: CREATED }),
  recovery: {
    kind: 'reconcile',
    id: ID,
    createdAt: CREATED,
    expiry: { kind: 'known', expiresAt: EXPIRES },
  },
};
const terminal = (outcome = 'refusal') => ({
  ok: false,
  code: 'RECOVERY_TERMINAL',
  protocol: RECOVERY_PROTOCOL,
  id: ID,
  createdAt: CREATED,
  expiresAt: EXPIRES,
  outcome,
  error: 'Private authenticated provider reason',
});
const fields = (token = TOKEN) => ({
  'Content-Type': 'application/json',
  [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
  [RECOVERY_EXPIRES_HEADER]: String(EXPIRES),
  ...(token === null ? {} : { 'X-Report-Token': token }),
});
const parse = (response, request = reconcile) =>
  parseAiResponse(response, request, new AbortController().signal, CREATED + 1);

it('carries bounded report proof only with the exact checked refusal tuple', async () => {
  const reply = await parse(
    new Response(JSON.stringify(terminal()), { status: 422, headers: fields() })
  );
  expect(reply.report).toEqual({ id: ID, createdAt: CREATED, expiresAt: EXPIRES, token: TOKEN });
  expect(Object.isFrozen(reply.report)).toBe(true);
  expect(reply).not.toHaveProperty('bytes');
  expect(reply.report).not.toHaveProperty('reason');
});
it.each([null, 'invalid token', 'x'.repeat(MAX_AI_REPORT_TOKEN_CHARACTERS + 1)])(
  'does not establish refusal reporting with missing or malformed token %s',
  async (token) => {
    const reply = await parse(
      new Response(JSON.stringify(terminal()), { status: 422, headers: fields(token) })
    );
    expect(reply.kind).toBe('recovery-terminal');
    expect(reply).not.toHaveProperty('report');
  }
);
it.each([
  ['error', 502],
  ['expired', 410],
])('does not make checked %s reportable', async (outcome, status) => {
  const reply = await parse(
    new Response(JSON.stringify(terminal(outcome)), { status, headers: fields() })
  );
  expect(reply.kind).toBe('recovery-terminal');
  expect(reply).not.toHaveProperty('report');
});
it.each([
  { id: 'b'.repeat(64) },
  { createdAt: CREATED + 1 },
  { expiresAt: EXPIRES + 1 },
  { extra: TOKEN },
])('rejects wrong terminal response tuple %j before carrying report proof', async (change) => {
  await expect(
    parse(
      new Response(JSON.stringify({ ...terminal(), ...change }), {
        status: 422,
        headers: fields(),
      })
    )
  ).rejects.toThrow();
});
it('ignores report headers on a generic refusal failure', async () => {
  const reply = await parse(
    new Response(JSON.stringify({ ok: false, error: 'Client cannot attest a refusal' }), {
      status: 422,
      headers: fields(),
    })
  );
  expect(reply).toEqual({ kind: 'recovery', reply: { kind: 'held', reason: 'rejected' } });
  expect(reply).not.toHaveProperty('report');
});
it('does not promote an advisory refusal status to reporting provenance', async () => {
  const reply = await parse(
    new Response(
      JSON.stringify({
        ok: true,
        protocol: RECOVERY_PROTOCOL,
        id: ID,
        expiresAt: EXPIRES,
        phase: 'refusal',
        pollAfterMs: RECOVERY_POLL_AFTER_MS,
      }),
      { status: 202, headers: fields() }
    )
  );
  expect(reply.kind).toBe('recovery');
  expect(reply).not.toHaveProperty('report');
});
function picture(token = TOKEN, changes = {}) {
  return new Response(BYTES, {
    headers: {
      ...fields(token),
      'Content-Type': 'image/png',
      [RECOVERY_DIGEST_HEADER]: recoveryDigest(BYTES),
      [RECOVERY_RECEIPT_HEADER]: 'b'.repeat(64),
      ...changes,
    },
  });
}
it('binds picture report proof to verified exact delivery bytes and original expiry', async () => {
  const reply = await parse(picture(), collect);
  expect(reply.kind).toBe('recovery-delivery');
  expect(reply.reply.bytes).toEqual(BYTES);
  expect(reply.report).toEqual({ id: ID, createdAt: CREATED, expiresAt: EXPIRES, token: TOKEN });
});
it('preserves absent picture token for the existing managed and BYOK report contract', async () => {
  const reply = await parse(picture(null), collect);
  expect(reply.report).toEqual({ id: ID, createdAt: CREATED, expiresAt: EXPIRES, token: null });
});
it.each(['invalid token', 'x'.repeat(MAX_AI_REPORT_TOKEN_CHARACTERS + 1)])(
  'rejects present malformed picture report token without discarding the retained-picture path: %s',
  async (token) => {
    const reply = await parse(picture(token), collect);
    expect(reply.kind).toBe('recovery-delivery');
    expect(reply).not.toHaveProperty('report');
  }
);
it.each([
  { [RECOVERY_DIGEST_HEADER]: 'c'.repeat(64) },
  { [RECOVERY_EXPIRES_HEADER]: String(EXPIRES + 1) },
  { [RECOVERY_RECEIPT_HEADER]: 'invalid' },
])('rejects wrong delivery proof %j before adopting report headers', async (change) => {
  await expect(parse(picture(TOKEN, change), collect)).rejects.toThrow();
});
it('keeps legacy recovery image replies without report adoption proof', async () => {
  const { deliveryProof: _delivery, terminalProof: _terminal, ...legacy } = collect;
  const reply = await parse(picture(), { ...legacy, headers: {} });
  expect(reply.kind).toBe('recovery');
  expect(reply).not.toHaveProperty('report');
});

it('pins the native report header to the hosted API header owner', () => {
  expect(REPORT_TOKEN_HEADER).toBe(HOSTED_REPORT_TOKEN_HEADER);
});
