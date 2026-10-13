import { describe, expect, it, vi } from 'vitest';
import { rgbaPng } from './native-png-fixtures.mjs';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_PATH,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  originalRecoveryExpiry,
  parseRecoveryJson,
} from '../../experiments/native-architecture/src/ai/recoveryContract.ts';
import {
  aiUrl,
  parseAiResponse,
  requestAi,
} from '../../experiments/native-architecture/src/ai/transport.ts';
const CREATED = 1700000000000;
const ID = 'a'.repeat(64);
const read = { kind: 'collect', id: ID, createdAt: CREATED, expiry: { kind: 'unknown' } };
const expiry = CREATED + 1200000;
const request = { path: RECOVERY_PATH, method: 'GET', headers: {}, recovery: read };
const status = (expiresAt = expiry) => ({
  ok: true,
  protocol: RECOVERY_PROTOCOL,
  id: ID,
  expiresAt,
  phase: 'pending',
  pollAfterMs: 4000,
});
const headers = (expiresAt = expiry) =>
  new Headers({ [RECOVERY_EXPIRES_HEADER]: String(expiresAt) });
describe('dedicated native recovery read admission', () => {
  it.each([1170000, 1260000])('accepts the exact original expiry boundary %s', (offset) => {
    expect(originalRecoveryExpiry(String(CREATED + offset), read)).toBe(CREATED + offset);
  });
  it.each([1169999, 1260001])('rejects one millisecond beyond expiry boundary %s', (offset) => {
    expect(() => originalRecoveryExpiry(String(CREATED + offset), read)).toThrow('held');
  });
  it.each([
    null,
    '',
    '01',
    '+1700001200000',
    '1700001200000.0',
    '1.7000012e12',
    ' 1700001200000',
    '1700001200000,1700001200000',
    '9007199254740992',
  ])('rejects noncanonical or missing original expiry %s', (raw) => {
    expect(() => originalRecoveryExpiry(raw, read)).toThrow('held');
  });
  it('requires status header/body agreement and preserves a previously known expiry', () => {
    expect(parseRecoveryJson(202, status(), headers(), read)).toEqual({
      kind: 'status',
      id: ID,
      expiresAt: expiry,
      phase: 'pending',
      pollAfterMs: 4000,
    });
    expect(() => parseRecoveryJson(202, status(expiry + 1), headers(), read)).toThrow();
    expect(() =>
      originalRecoveryExpiry(String(expiry + 1), {
        ...read,
        expiry: { kind: 'known', expiresAt: expiry },
      })
    ).toThrow();
    expect(() =>
      originalRecoveryExpiry(String(expiry), { ...read, createdAt: Number.MAX_SAFE_INTEGER })
    ).toThrow();
  });
  it.each([
    { protocol: 'old' },
    { id: 'b'.repeat(64) },
    { phase: 'ready' },
    { pollAfterMs: 1 },
    { extra: true },
  ])('rejects changed status contract %j', (change) => {
    expect(() => parseRecoveryJson(202, { ...status(), ...change }, headers(), read)).toThrow();
  });
  it('admits only exact capability JSON without inventing a response version header', () => {
    expect(
      parseRecoveryJson(
        200,
        { ok: true, protocol: RECOVERY_PROTOCOL, jobTtlMs: 1200000 },
        new Headers(),
        { kind: 'capability' }
      )
    ).toEqual({ kind: 'capability' });
    expect(() =>
      parseRecoveryJson(200, { ok: true, jobTtlMs: 1200000 }, new Headers(), { kind: 'capability' })
    ).toThrow();
  });
  it('keeps image bytes unadmitted until digest verification, OS decode and native commit exist', async () => {
    const bytes = rgbaPng(2, 2, 255);
    const reply = await parseAiResponse(
      new Response(bytes, {
        headers: {
          ...Object.fromEntries(headers()),
          'Content-Type': 'image/png',
          'X-AI-Recovery-Version': RECOVERY_PROTOCOL,
          [RECOVERY_DIGEST_HEADER]: 'c'.repeat(64),
        },
      }),
      request,
      new AbortController().signal,
      0
    );
    expect(reply.kind).toBe('recovery');
    expect(reply.reply.kind).toBe('unadmitted-image');
    expect(reply.reply.bytes).toEqual(new Uint8Array(bytes));
    expect(reply.reply.expiresAt).toBe(expiry);
  });
  it.each(['X-AI-Recovery-Version', RECOVERY_EXPIRES_HEADER, RECOVERY_DIGEST_HEADER])(
    'rejects an image missing %s',
    async (name) => {
      const fields = headers();
      fields.set('Content-Type', 'image/png');
      fields.set('X-AI-Recovery-Version', RECOVERY_PROTOCOL);
      fields.set(RECOVERY_DIGEST_HEADER, 'c'.repeat(64));
      fields.delete(name);
      await expect(
        parseAiResponse(
          new Response(rgbaPng(2, 2, 255), { headers: fields }),
          request,
          new AbortController().signal,
          0
        )
      ).rejects.toThrow();
    }
  );
  it.each([
    ['RECOVERY_ABSENT', 404, 'absent'],
    ['RECOVERY_EXPIRED', 404, 'expired'],
    ['RECOVERY_CONFLICT', 409, 'conflict'],
  ])('keeps %s held without a local-clock release', (code, codeStatus, reason) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Number.MAX_SAFE_INTEGER);
    expect(
      parseRecoveryJson(codeStatus, { ok: false, code, error: 'held' }, new Headers(), read)
    ).toEqual({ kind: 'held', reason });
    clock.mockRestore();
  });
  it('unconditionally suppresses experiment network activation and exposes no ACK request', async () => {
    const transport = vi.fn();
    expect(await requestAi(transport, request, vi.fn())).toEqual({
      kind: 'recovery',
      reply: { kind: 'held', reason: 'unavailable' },
    });
    expect(transport).not.toHaveBeenCalled();
    expect(() => aiUrl(request)).toThrow('qualified');
  });
});
