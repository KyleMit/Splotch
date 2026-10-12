import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aiUrl,
  parseAiResponse,
  requestAi,
} from '../../experiments/native-architecture/src/ai/transport.ts';
import {
  RECOVERY_PATH,
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
  RECOVERY_MAX_IMAGE_BYTES,
} from '../../experiments/native-architecture/src/ai/recoveryContract.ts';
import { recoveryDigest } from '../../experiments/native-architecture/src/ai/recoveryDigest.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
const CREATED = 1700000000000;
const EXPIRES = CREATED + 1200000;
const ID = 'a'.repeat(64);
const RECEIPT = 'b'.repeat(64);
const BYTES = new Uint8Array(rgbaPng(2, 2, 255));
const DIGEST = recoveryDigest(BYTES);
/** @type {import('../../experiments/native-architecture/src/ai/transport.ts').RecoveryReadRequest} */
const collect = {
  path: RECOVERY_PATH,
  method: 'GET',
  headers: {},
  deliveryProof: true,
  recovery: {
    kind: 'collect',
    id: ID,
    createdAt: CREATED,
    expiry: { kind: 'known', expiresAt: EXPIRES },
  },
};
/** @type {import('../../experiments/native-architecture/src/ai/transport.ts').RecoveryMutationRequest} */
const ack = {
  path: RECOVERY_PATH,
  method: 'POST',
  headers: {},
  body: JSON.stringify({
    operation: 'ack',
    id: ID,
    createdAt: CREATED,
    digest: DIGEST,
    receipt: RECEIPT,
  }),
  recovery: {
    kind: 'ack',
    id: ID,
    createdAt: CREATED,
    digest: DIGEST,
    receipt: RECEIPT,
    expiry: { kind: 'known', expiresAt: EXPIRES },
  },
};
const headers = () =>
  new Headers({
    'Content-Type': 'image/png',
    [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
    [RECOVERY_EXPIRES_HEADER]: String(EXPIRES),
    [RECOVERY_DIGEST_HEADER]: DIGEST,
    [RECOVERY_RECEIPT_HEADER]: RECEIPT,
  });
const parse = (response, request = collect, now = CREATED + 1) =>
  parseAiResponse(response, request, new AbortController().signal, now);
const ackBody = () => ({
  ok: true,
  protocol: RECOVERY_PROTOCOL,
  id: ID,
  phase: 'acknowledged',
  expiresAt: EXPIRES,
  deliveryDigest: DIGEST,
  deliveryReceipt: RECEIPT,
});

describe('recovery transport source proposals (unrun at packet seal)', () => {
  it('returns immutable separate delivery proof while retaining the legacy GET image shape', async () => {
    const reply = await parse(new Response(BYTES, { headers: headers() }));
    expect(reply.kind).toBe('recovery-delivery');
    expect(reply.receipt).toBe(RECEIPT);
    expect(Object.isFrozen(reply)).toBe(true);
    expect(reply.reply.bytes).toEqual(BYTES);
    const { deliveryProof: _deliveryProof, ...legacy } = collect;
    const old = await parse(new Response(BYTES, { headers: headers() }), legacy);
    expect(old.kind).toBe('recovery');
    expect(old.reply.kind).toBe('unadmitted-image');
    expect(Object.keys(old.reply).sort()).toEqual(['bytes', 'digest', 'expiresAt', 'kind', 'mime']);
  });
  it.each([
    ['missing receipt', (value) => value.delete(RECOVERY_RECEIPT_HEADER)],
    ['noncanonical receipt', (value) => value.set(RECOVERY_RECEIPT_HEADER, 'B'.repeat(64))],
    ['changed digest', (value) => value.set(RECOVERY_DIGEST_HEADER, 'c'.repeat(64))],
    ['changed expiry', (value) => value.set(RECOVERY_EXPIRES_HEADER, String(EXPIRES + 1))],
    ['changed MIME', (value) => value.set('Content-Type', 'image/jpeg')],
    ['MIME parameters', (value) => value.set('Content-Type', 'image/png; other=value')],
    ['changed length', (value) => value.set('Content-Length', String(BYTES.length + 1))],
    ['noncanonical length', (value) => value.set('Content-Length', `0${BYTES.length}`)],
  ])('rejects %s before providing delivery proof', async (_, mutate) => {
    const fields = headers();
    mutate(fields);
    await expect(parse(new Response(BYTES, { headers: fields }))).rejects.toThrow();
  });
  it('cancels an oversized declared body before acquiring its reader', async () => {
    const fields = headers();
    fields.set('Content-Length', String(RECOVERY_MAX_IMAGE_BYTES + 1));
    const cancel = vi.fn(async () => {}),
      getReader = vi.fn(() => {
        throw new Error('reader acquired');
      });
    await expect(
      parse({ status: 200, headers: fields, body: { cancel, getReader } })
    ).rejects.toThrow('Response exceeds limit');
    expect(cancel).toHaveBeenCalledOnce();
    expect(getReader).not.toHaveBeenCalled();
  });
  it('rejects a delivery when its bounded reader is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      parseAiResponse(
        new Response(BYTES, { headers: headers() }),
        collect,
        controller.signal,
        CREATED + 1
      )
    ).rejects.toThrow('cancelled');
  });
  it('rejects a delivery at its original expiry', async () => {
    await expect(
      parse(new Response(BYTES, { headers: headers() }), collect, EXPIRES)
    ).rejects.toThrow();
  });
  it('rejects malformed PNG even when its supplied digest matches', async () => {
    const bytes = BYTES.slice(0, -4),
      fields = headers();
    fields.set(RECOVERY_DIGEST_HEADER, recoveryDigest(bytes));
    await expect(parse(new Response(bytes, { headers: fields }))).rejects.toThrow();
  });
  it('confirms only exact ACK200 shared DTO against the retained delivery tuple', async () => {
    const reply = await parse(
      new Response(JSON.stringify(ackBody()), { headers: { 'Content-Type': 'application/json' } }),
      ack
    );
    expect(reply).toEqual({ kind: 'recovery-ack', confirmation: { status: 200, body: ackBody() } });
  });
  it.each([
    { id: 'c'.repeat(64) },
    { expiresAt: EXPIRES + 1 },
    { deliveryDigest: 'd'.repeat(64) },
    { deliveryReceipt: 'e'.repeat(64) },
    { phase: 'delivery' },
    { extra: true },
  ])('rejects malformed or mismatched ACK200 %j', async (change) => {
    await expect(
      parse(
        new Response(JSON.stringify({ ...ackBody(), ...change }), {
          headers: { 'Content-Type': 'application/json' },
        }),
        ack
      )
    ).rejects.toThrow();
  });
  it('keeps ACK202 acknowledged advisory and never produces ACK confirmation', async () => {
    const fields = headers();
    fields.set('Content-Type', 'application/json');
    const body = {
      ok: true,
      protocol: RECOVERY_PROTOCOL,
      id: ID,
      expiresAt: EXPIRES,
      phase: 'acknowledged',
      pollAfterMs: 4000,
    };
    const reply = await parse(
      new Response(JSON.stringify(body), { status: 202, headers: fields }),
      ack
    );
    expect(reply.kind).toBe('recovery');
    expect(reply.reply.kind).toBe('status');
    expect(reply.reply.phase).toBe('acknowledged');
  });
  it('rejects a changed JSON mutation before treating any response as its confirmation', async () => {
    const changed = {
      ...ack,
      body: JSON.stringify({
        operation: 'ack',
        id: ID,
        createdAt: CREATED,
        digest: DIGEST,
        receipt: 'f'.repeat(64),
      }),
    };
    await expect(
      parse(
        new Response(JSON.stringify(ackBody()), {
          headers: { 'Content-Type': 'application/json' },
        }),
        changed
      )
    ).rejects.toThrow();
  });
  it.each(['read', 'admission', 'reconcile', 'ack'])(
    'keeps both independent no-network guards closed for %s',
    async (kind) => {
      const requests = {
        read: collect,
        admission: {
          path: RECOVERY_PATH,
          method: 'POST',
          query: 'style=Magical',
          headers: {},
          body: BYTES,
          recovery: { kind: 'admit', id: ID, createdAt: CREATED, expiry: { kind: 'unknown' } },
        },
        reconcile: {
          path: RECOVERY_PATH,
          method: 'POST',
          headers: {},
          body: JSON.stringify({ operation: 'reconcile', id: ID, createdAt: CREATED }),
          recovery: { kind: 'reconcile', id: ID, createdAt: CREATED, expiry: { kind: 'unknown' } },
        },
        ack,
      };
      const transport = vi.fn();
      expect(() => aiUrl(requests[kind])).toThrow('qualified');
      expect(await requestAi(transport, requests[kind], vi.fn())).toEqual({
        kind: 'recovery',
        reply: { kind: 'held', reason: 'unavailable' },
      });
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it('keeps both maintained sheets on the same recovery action owner', () => {
    for (const path of ['ai/AiSheet.tsx', 'rsdDrawing/RsdAiSheet.tsx']) {
      const source = readFileSync(
        new URL(`../../experiments/native-architecture/src/${path}`, import.meta.url),
        'utf8'
      );
      expect(source).toContain(
        '<AiRecoveryActions owner={owner} state={state} waiting={waiting} />'
      );
    }
  });
});
