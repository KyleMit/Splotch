import { adoptPaper } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { pictureExport } from '../../experiments/native-architecture/src/drawing/pictureExport.ts';
import { prepareAiPng } from '../../experiments/native-architecture/src/ai/prepare.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { describe, expect, it, vi } from 'vitest';
import {
  parseAiResponse,
  readAiBytes,
} from '../../experiments/native-architecture/src/ai/transport.ts';
import {
  AI_STYLES,
  MAX_JSON_BYTES,
  REQUEST_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  JOB_TTL_MS,
  FREE_LIMIT,
} from '../../experiments/native-architecture/src/ai/contract.ts';
import { readFileSync } from 'node:fs';
import { AI_UNFINISHED_MESSAGE } from '../../web/src/lib/ai/generationFailures.ts';
import {
  FREE_DAILY_LIMIT_EXHAUSTED_CODE,
  FREE_GRANT_EXHAUSTED_CODE,
  GENERATION_UNAVAILABLE_CODE,
  THROTTLED_STATUS,
} from '../../web/src/lib/ai/generationResult.ts';
vi.mock('$lib/ai/generationResult', async () => import('../../web/src/lib/ai/generationResult.ts'));
const { readAiImageResponse } = await import('../../web/src/lib/drawing/aiImageResponse.ts');
const signal = () => new AbortController().signal;
const start = { path: '/api/generate-image', method: 'POST', headers: {} };
const poll = { ...start, path: '/api/generation-result', method: 'GET' };
describe('strict native hosted AI contract', () => {
  it('pins the canonical style order and timeout vocabulary across the isolated candidate boundary', () => {
    const styles = readFileSync(new URL('../../web/src/lib/ai/styles.ts', import.meta.url), 'utf8');
    const block = styles.split('export const STYLE_SUFFIXES = {')[1].split('} satisfies')[0];
    expect(AI_STYLES).toEqual([...block.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]));
    const limits = readFileSync(new URL('../../web/src/lib/ai/limits.ts', import.meta.url), 'utf8');
    expect(limits).toContain(
      `CLIENT_REQUEST_TIMEOUT_MS = ${REQUEST_TIMEOUT_MS.toLocaleString('en-US').replaceAll(',', '_')}`
    );
    expect(POLL_INTERVAL_MS).toBe(3000);
    expect(JOB_TTL_MS).toBe(1200000);
    expect(FREE_LIMIT).toBe(10);
  });
  it.each([
    ['not-a-job', 3000],
    ['a'.repeat(64), -1],
    ['a'.repeat(64), Infinity],
  ])(
    'reads a malformed start ticket %s as a picture that did not finish, as shipping does',
    async (jobId, pollAfterMs) => {
      expect(
        await parseAiResponse(
          new Response(JSON.stringify({ ok: true, jobId, pollAfterMs }), { status: 202 }),
          start,
          signal(),
          0
        )
      ).toMatchObject({ kind: 'failure', reason: 'server', detail: AI_UNFINISHED_MESSAGE });
    }
  );
  it('distinguishes empty pending polls and unavailable job reads from malformed starts', async () => {
    expect(await parseAiResponse(new Response(null, { status: 202 }), poll, signal(), 0)).toEqual({
      kind: 'pending',
      delayMs: 3000,
    });
    expect(
      await parseAiResponse(
        new Response('{"ok":false,"code":"GENERATION_UNAVAILABLE","error":"unavailable"}', {
          status: 503,
        }),
        poll,
        signal(),
        0
      )
    ).toEqual({ kind: 'pending', delayMs: 3000 });
    expect(
      await parseAiResponse(new Response(null, { status: 202 }), start, signal(), 0)
    ).toMatchObject({ kind: 'failure', reason: 'server' });
  });
  it('cancels the stream at the first chunk over the cap without buffering its tail', async () => {
    const cancel = vi.fn();
    let chunks = 0;
    const body = new ReadableStream({
      pull(controller) {
        chunks++;
        controller.enqueue(new Uint8Array(MAX_JSON_BYTES));
        if (chunks === 3) controller.close();
      },
      cancel,
    });
    await expect(
      readAiBytes({ headers: new Headers(), body }, MAX_JSON_BYTES, signal())
    ).rejects.toThrow('limit');
    expect(cancel).toHaveBeenCalledOnce();
    expect(chunks).toBeLessThanOrEqual(3);
  });
  it('honors Retry-After for polling and keeps server failures separate from safety', async () => {
    expect(
      await parseAiResponse(
        new Response('{"ok":false,"error":"slow"}', {
          status: 429,
          headers: { 'Retry-After': '12' },
        }),
        poll,
        signal(),
        0
      )
    ).toEqual({ kind: 'pending', delayMs: 12000 });
    expect(
      (
        await parseAiResponse(
          new Response('{"ok":false,"error":"private"}', { status: 422 }),
          start,
          signal(),
          0
        )
      ).reason
    ).toBe('safety');
  });
});

it('bounds capture bytes and rejects a PNG with dimensions different from the drawing paper', () => {
  const canonical = { width: 1024, height: 768 };
  const portrait = { width: 567, height: 1024 };
  expect(() => prepareAiPng(rgbaPng(2, 2).toString('base64'), canonical)).toThrow('dimensions');
  expect(prepareAiPng(rgbaPng(1024, 768).toString('base64'), canonical).length).toBeGreaterThan(33);
  expect(prepareAiPng(rgbaPng(567, 1024).toString('base64'), portrait).length).toBeGreaterThan(33);
  expect(() => prepareAiPng(rgbaPng(1024, 768).toString('base64'), portrait)).toThrow('dimensions');
  expect(() => prepareAiPng('iVBORw0KGgo=', canonical)).toThrow('header');
});
it('pins native secure owner semantics and the namespaced app pseudonym without exposing platform identifiers', () => {
  const kotlin = readFileSync(
    new URL(
      '../../experiments/native-architecture/android/app/src/main/java/art/splotch/migration/probe/SplotchAIEnvironment.kt',
      import.meta.url
    ),
    'utf8'
  );
  const swift = readFileSync(
    new URL(
      '../../experiments/native-architecture/ios/HelloWorld/SplotchAIEnvironment.swift',
      import.meta.url
    ),
    'utf8'
  );
  const shipping = readFileSync(
    new URL('../../web/src/lib/state/freeGenerations.svelte.ts', import.meta.url),
    'utf8'
  );
  expect(shipping).toContain("INSTALLATION_NAMESPACE = 'splotch-free-generation-v1'");
  expect(kotlin).toContain('splotch-free-generation-v1:');
  expect(swift).toContain('splotch-free-generation-v1:');
  expect(kotlin).toContain('context.noBackupFilesDir');
  expect(kotlin).toContain('key(false)');
  expect(kotlin).toContain('AES/GCM/NoPadding');
  expect(swift).toContain('kSecAttrAccessibleWhenUnlockedThisDeviceOnly');
  expect(swift).toContain('kSecAttrSynchronizable as String: false');
});

// What the child is shown next, in both apps' terms: shipping's readAiImageResponse plus
// generateAiImage's handling of each kind, and the native reply plus its generation owner's.
function shippingOutcome(response, polling) {
  switch (response.kind) {
    case 'pending':
      return polling ? 'wait' : 'retry';
    case 'throttled':
      return polling ? 'wait' : 'retry';
    case 'free-exhausted':
    case 'free-unavailable':
      return 'setup';
    case 'error':
      return 'retry';
    default:
      return response.kind;
  }
}
function nativeOutcome(reply) {
  if (reply.kind === 'pending') return 'wait';
  if (reply.kind !== 'failure') return reply.kind;
  if (reply.reason === 'exhausted' || reply.reason === 'unavailable') return 'setup';
  return reply.reason === 'safety' ? 'safety' : 'retry';
}
const failure = (status, body) => () =>
  new Response(typeof body === 'string' ? body : JSON.stringify({ ok: false, ...body }), {
    status,
    headers: { 'Retry-After': '5' },
  });
it.each([
  ['a bare platform 502', failure(502, '<html>Bad gateway</html>')],
  ['a 502 with the server error', failure(502, { error: 'Upstream down' })],
  ['a 504 with no body', failure(504, '')],
  ['a plain 503', failure(503, { error: 'Busy' })],
  ['a 429 throttle', failure(429, { error: 'Slow down' })],
  ['a 422 refusal', failure(422, { error: 'Refused' })],
  ['a 400', failure(400, { error: 'Bad request' })],
  ['a 404', failure(404, { error: 'Gone' })],
  [
    'an exhausted grant',
    failure(403, { code: FREE_GRANT_EXHAUSTED_CODE, error: 'Used up', remaining: 0 }),
  ],
  [
    'a closed free day',
    failure(503, { code: FREE_DAILY_LIMIT_EXHAUSTED_CODE, error: 'Not today' }),
  ],
  ['an unreadable job', failure(503, { code: GENERATION_UNAVAILABLE_CODE, error: 'Not now' })],
])('answers %s as shipping does, on a start and on a poll', async (_, reply) => {
  for (const request of [start, poll]) {
    const polling = request === poll;
    const shipping = await readAiImageResponse(reply());
    const native = await parseAiResponse(reply(), request, signal(), 0);
    expect(nativeOutcome(native)).toBe(shippingOutcome(shipping, polling));
    const reported =
      !polling && (shipping.kind === 'error' || shipping.kind === 'throttled')
        ? { status: shipping.status ?? THROTTLED_STATUS, detail: shipping.detail }
        : null;
    expect(reported && { status: native.status, detail: native.detail }).toEqual(reported);
  }
});

it('admits the captured resized AI grid and rejects the original paper grid for those pixels', () => {
  const paper = adoptPaper(400, 800, 2);
  const original = pictureExport(paper, 'light', 1).size;
  const current = pictureExport(paper, 'light', 1, { width: 800, height: 1000 }).size;
  const pixels = rgbaPng(current.width, current.height).toString('base64');
  expect(prepareAiPng(pixels, current).length).toBeGreaterThan(33);
  expect(() => prepareAiPng(pixels, original)).toThrow('dimensions');
});
