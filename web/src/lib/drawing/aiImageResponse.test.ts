// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readAiImageResponse } from './aiImageResponse';

describe('readAiImageResponse', () => {
  it('reads a successful image response', async () => {
    const result = await readAiImageResponse(new Response('image-bytes', { status: 200 }));

    expect(result.kind).toBe('image');
    if (result.kind === 'image') expect(await result.blob.text()).toBe('image-bytes');
  });

  it('classifies a safety refusal', async () => {
    await expect(
      readAiImageResponse(new Response('Drawing was blocked', { status: 422 }))
    ).resolves.toEqual({ kind: 'safety' });
  });

  it.each([
    ['12', '12'],
    [undefined, null],
  ])('reads a throttled response with Retry-After %s', async (header, retryAfter) => {
    const headers = header === undefined ? undefined : { 'Retry-After': header };

    await expect(
      readAiImageResponse(new Response('Please wait', { status: 429, headers }))
    ).resolves.toEqual({ kind: 'throttled', retryAfter, detail: 'Please wait' });
  });

  it('reads a generic non-OK response', async () => {
    await expect(
      readAiImageResponse(new Response('Upstream unavailable', { status: 502 }))
    ).resolves.toEqual({ kind: 'error', status: 502, detail: 'Upstream unavailable' });
  });

  it('reads the error from a canonical JSON failure response', async () => {
    await expect(
      readAiImageResponse(
        new Response(JSON.stringify({ ok: false, error: 'Upstream unavailable' }), { status: 502 })
      )
    ).resolves.toEqual({ kind: 'error', status: 502, detail: 'Upstream unavailable' });
  });

  it('keeps the response classification when its diagnostic body is unreadable', async () => {
    const response = new Response('unreadable', { status: 503 });
    vi.spyOn(response, 'text').mockRejectedValue(new Error('body stream failed'));

    await expect(readAiImageResponse(response)).resolves.toEqual({
      kind: 'error',
      status: 503,
      detail: '',
    });
  });
});
