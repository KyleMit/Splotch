import { adoptPaper } from '../../src/drawing/paperSpace.ts';
import { pictureExport } from '../../src/drawing/pictureExport.ts';
import { prepareAiPng } from '../../src/ai/prepare.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
import { describe, expect, it, vi } from 'vitest';
import { parseAiResponse, readAiBytes } from '../../src/ai/transport.ts';
import {
  AI_STYLES,
  MAX_JSON_BYTES,
  REQUEST_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  JOB_TTL_MS,
  FREE_LIMIT,
} from '../../src/ai/contract.ts';
import { readFileSync } from 'node:fs';
import { AI_UNFINISHED_MESSAGE } from '../../src/lib/ai/generationFailures.ts';

vi.mock('$lib/ai/generationResult', async () => import('../../src/lib/ai/generationResult.ts'));
const signal = () => new AbortController().signal;
const start = { path: '/api/generate-image', method: 'POST', headers: {} };
const poll = { ...start, path: '/api/generation-result', method: 'GET' };
describe('strict native hosted AI contract', () => {
  it('pins the canonical style order and timeout vocabulary across the isolated candidate boundary', () => {
    const styles = readFileSync(new URL('../../src/lib/ai/styles.ts', import.meta.url), 'utf8');
    const block = styles.split('export const STYLE_SUFFIXES = {')[1].split('} satisfies')[0];
    expect(AI_STYLES).toEqual([...block.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]));
    const limits = readFileSync(new URL('../../src/lib/ai/limits.ts', import.meta.url), 'utf8');
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
      '../../android/app/src/main/java/art/splotch/app/SplotchAIEnvironment.kt',
      import.meta.url
    ),
    'utf8'
  );
  const swift = readFileSync(
    new URL('../../ios/Splotch/SplotchAIEnvironment.swift', import.meta.url),
    'utf8'
  );
  expect(kotlin).toContain('splotch-free-generation-v1:');
  expect(swift).toContain('splotch-free-generation-v1:');
  expect(kotlin).toContain('context.noBackupFilesDir');
  expect(kotlin).toContain('key(false)');
  expect(kotlin).toContain('AES/GCM/NoPadding');
  expect(swift).toContain('kSecAttrAccessibleWhenUnlockedThisDeviceOnly');
  expect(swift).toContain('kSecAttrSynchronizable as String: false');
});

const failure = (status, body) => () =>
  new Response(typeof body === 'string' ? body : JSON.stringify({ ok: false, ...body }), {
    status,
    headers: { 'Retry-After': '5' },
  });
const both = (reply) => ({ start: reply, poll: reply });
const RESPONSE_CASES = [
  [
    'a bare platform 502',
    failure(502, '<html>Bad gateway</html>'),
    both({ kind: 'failure', reason: 'server', status: 502, detail: '<html>Bad gateway</html>' }),
  ],
  [
    'a 502 with the server error',
    failure(502, { error: 'Upstream down' }),
    both({ kind: 'failure', reason: 'server', status: 502, detail: 'Upstream down' }),
  ],
  [
    'a 504 with no body',
    failure(504, ''),
    both({ kind: 'failure', reason: 'server', status: 504, detail: '' }),
  ],
  [
    'a plain 503',
    failure(503, { error: 'Busy' }),
    both({ kind: 'failure', reason: 'server', status: 503, detail: 'Busy' }),
  ],
  [
    'a 429 throttle',
    failure(429, { error: 'Slow down' }),
    {
      start: { kind: 'failure', reason: 'throttled', status: 429, detail: 'Slow down' },
      poll: { kind: 'pending', delayMs: 5000 },
    },
  ],
  [
    'a 422 refusal',
    failure(422, { error: 'Refused' }),
    both({ kind: 'failure', reason: 'safety', status: 422, reportToken: null }),
  ],
  [
    'a 400',
    failure(400, { error: 'Bad request' }),
    both({ kind: 'failure', reason: 'server', status: 400, detail: 'Bad request' }),
  ],
  [
    'a 404',
    failure(404, { error: 'Gone' }),
    both({ kind: 'failure', reason: 'server', status: 404, detail: 'Gone' }),
  ],
  [
    'an exhausted grant',
    failure(403, { code: 'FREE_GRANT_EXHAUSTED', error: 'Used up', remaining: 0 }),
    both({ kind: 'failure', reason: 'exhausted', status: 403, detail: 'Used up' }),
  ],
  [
    'a closed free day',
    failure(503, { code: 'FREE_DAILY_LIMIT_EXHAUSTED', error: 'Not today' }),
    both({ kind: 'failure', reason: 'unavailable', status: 503, detail: 'Not today' }),
  ],
  [
    'an unreadable job',
    failure(503, { code: 'GENERATION_UNAVAILABLE', error: 'Not now' }),
    {
      start: { kind: 'failure', reason: 'server', status: 503, detail: 'Not now' },
      poll: { kind: 'pending', delayMs: 3000 },
    },
  ],
];
it.each(
  RESPONSE_CASES.flatMap(([label, reply, expected]) =>
    [
      ['start', start],
      ['poll', poll],
    ].map(([phase, request]) => ({ label, phase, request, reply, expected: expected[phase] }))
  )
)('answers $label on a $phase', async ({ request, reply, expected }) => {
  const native = await parseAiResponse(reply(), request, signal(), 0);
  expect(native).toMatchObject(expected);
  expect(native.detail).toBe(expected.detail);
});

it('admits the captured resized AI grid and rejects the original paper grid for those pixels', () => {
  const paper = adoptPaper(400, 800, 2);
  const original = pictureExport(paper, 'light', 1).size;
  const current = pictureExport(paper, 'light', 1, { width: 800, height: 1000 }).size;
  const pixels = rgbaPng(current.width, current.height).toString('base64');
  expect(prepareAiPng(pixels, current).length).toBeGreaterThan(33);
  expect(() => prepareAiPng(pixels, original)).toThrow('dimensions');
});
