import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { rgbaPng } from './native-png-fixtures.mjs';
import { AI_IMAGE_DECODE_TIMEOUT_MS } from '../../experiments/native-architecture/src/ai/imageBounds.ts';
import { admitAiImage } from '../../experiments/native-architecture/src/platform/aiImage.web.ts';
import { aiTransport } from '../../experiments/native-architecture/src/platform/ai.web.ts';

const decode = vi.fn();
let picture;
let createUrl;
let revokeUrl;
beforeEach(() => {
  decode.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 2;
      naturalHeight = 2;
      src = '';
      decode = decode;
    }
  );
  const ImageClass = Image;
  vi.stubGlobal(
    'Image',
    vi.fn(function () {
      picture = new ImageClass();
      return picture;
    })
  );
  createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:owned-picture');
  revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('admits actual PNG bytes only after browser decoding confirms the parsed dimensions', async () => {
  const bytes = rgbaPng(2, 2, 255);
  await admitAiImage(bytes, 'image/png');
  const blob = createUrl.mock.calls[0][0];
  expect(blob.type).toBe('image/png');
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array(bytes));
  expect(decode).toHaveBeenCalledOnce();
  expect(picture.decoding).toBe('async');
  expect(picture.src).toBe('');
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:owned-picture');
});
it('rejects malformed bytes before creating a browser URL or calling its decoder', async () => {
  await expect(admitAiImage(new Uint8Array([1, 2, 3]), 'image/png')).rejects.toThrow();
  expect(createUrl).not.toHaveBeenCalled();
  expect(decode).not.toHaveBeenCalled();
});

it('sends only the selected upload bytes when the input shares a larger backing buffer', async () => {
  const body = Buffer.from([90, 91, 1, 2, 3, 92]).subarray(2, 5);
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
  const signal = new AbortController().signal;
  await aiTransport({ path: '/api/generate-image', method: 'POST', headers: {}, body }, signal);
  const options = fetch.mock.calls[0][1];
  expect([...new Uint8Array(await options.body.arrayBuffer())]).toEqual([1, 2, 3]);
  expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', signal });
});

it("calls the page's own origin, whose host serves the /api function", async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
  const signal = new AbortController().signal;
  await aiTransport(
    { path: '/api/generation-result', query: 'job=abc', method: 'GET', headers: {} },
    signal
  );
  expect(fetch.mock.calls[0][0]).toBe('/api/generation-result?job=abc');
});
it('admits a tablet original at capture resolution while retaining the remote-result budget', async () => {
  const width = 2564;
  const height = 2048;
  const png = rgbaPng(width, height, 255);
  decode.mockImplementation(async () => {
    picture.naturalWidth = width;
    picture.naturalHeight = height;
  });
  await expect(admitAiImage(png, 'image/png', 'original')).resolves.toBeUndefined();
  await expect(admitAiImage(png, 'image/png')).rejects.toThrow();
});

it('rejects browser decode failure and releases its temporary picture', async () => {
  decode.mockRejectedValue(new Error('decode failed'));
  await expect(admitAiImage(rgbaPng(2, 2, 255), 'image/png')).rejects.toThrow('decode failed');
  expect(picture.src).toBe('');
  expect(revokeUrl).toHaveBeenCalledOnce();
});
it('rejects a dimension mismatch even when browser decoding resolves', async () => {
  decode.mockImplementation(async () => {
    picture.naturalWidth = 3;
  });
  await expect(admitAiImage(rgbaPng(2, 2, 255), 'image/png')).rejects.toThrow('corrupt');
  expect(revokeUrl).toHaveBeenCalledOnce();
});
it('bounds a stalled browser decoder and releases the URL without accepting a late completion', async () => {
  vi.useFakeTimers();
  let finish;
  decode.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  const result = admitAiImage(rgbaPng(2, 2, 255), 'image/png').then(
    () => 'admitted',
    (error) => error.message
  );
  await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(AI_IMAGE_DECODE_TIMEOUT_MS);
  expect(await result).toBe('AI picture decoding did not finish.');
  expect(picture.src).toBe('');
  expect(revokeUrl).toHaveBeenCalledOnce();
  finish();
  await Promise.resolve();
  expect(revokeUrl).toHaveBeenCalledOnce();
});
