// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { fakeAiProvider, FAKE_IMAGE_DELAY_MS } from './fake';
const retention = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../testDataRetention', () => ({ maintainTestData: retention }));

afterEach(() => vi.useRealTimers());
const request = (apiKey: string) => ({
  apiKey,
  image: { bytes: new Uint8Array([1]), mimeType: 'image/png' },
  prompt: 'Draw a picture',
  deadlineMs: 20_000,
});

it('maps retention outages through the existing provider failure contracts', async () => {
  retention.mockRejectedValueOnce(new Error('Storage unavailable'));
  expect(await fakeAiProvider.generateImage(request('sk-test-success'))).toEqual({
    kind: 'error',
    reason: 'Test data retention is unavailable',
  });
  retention.mockRejectedValueOnce(new Error('Storage unavailable'));
  expect(await fakeAiProvider.verifyKey('sk-test-success')).toEqual({
    ok: false,
    kind: 'unreachable',
    reason: 'Test data retention is unavailable',
  });
});

it('respects a shorter caller deadline and refuses an unrecognized generation key', async () => {
  vi.useFakeTimers();
  const short = fakeAiProvider.generateImage({ ...request('sk-test-success'), deadlineMs: 1 });
  await vi.runAllTimersAsync();
  expect(await short).toEqual({
    kind: 'error',
    reason: 'OpenAI request failed: Request timed out.',
  });
  const unknown = fakeAiProvider.generateImage(request('constructor'));
  await vi.runAllTimersAsync();
  expect(await unknown).toEqual({
    kind: 'error',
    reason: 'OpenAI request failed: 401 Incorrect API key provided',
  });
});

it('returns deterministic PNG bytes only after the realistic delay', async () => {
  vi.useFakeTimers();
  let finished = false;
  const result = fakeAiProvider.generateImage(request('sk-test-success')).then((image) => {
    finished = true;
    return image;
  });
  await vi.advanceTimersByTimeAsync(FAKE_IMAGE_DELAY_MS - 1);
  expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  const first = await result;
  const next = fakeAiProvider.generateImage(request('sk-test-success'));
  await vi.runAllTimersAsync();
  expect(await next).toEqual(first);
  expect(first).toMatchObject({
    kind: 'image',
    mimeType: 'image/png',
    data: expect.stringMatching(/^iVBOR/),
  });
});

it.each([
  ['sk-test-invalid-key', 'error'],
  ['sk-test-rate-limited', 'error'],
  ['sk-test-error', 'error'],
  ['sk-test-timeout', 'error'],
  ['sk-test-refusal', 'refusal'],
] as const)('maps %s into the existing provider %s result', async (key, kind) => {
  vi.useFakeTimers();
  const pending = fakeAiProvider.generateImage(request(key));
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ kind, reason: expect.any(String) });
});

it.each([
  ['sk-test-success', { ok: true }],
  ['sk-test-invalid-key', { ok: false, kind: 'rejected' }],
  ['sk-test-verify-rate-limited', { ok: false, kind: 'unreachable' }],
  ['sk-test-verify-timeout', { ok: false, kind: 'unreachable' }],
  ['constructor', { ok: false, kind: 'rejected' }],
])('checks %s without a model secret or network', async (key, expected) => {
  vi.useFakeTimers();
  const pending = fakeAiProvider.verifyKey(key);
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject(expected);
});
