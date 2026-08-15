// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readAiImageResponse, type AiImageResponse } from './aiImageResponse';

// Narrows the union so an assertion about the decoded image reads unconditionally. Branching on
// `result.kind` instead would let that assertion be skipped rather than fail.
function expectImage(
  result: AiImageResponse
): asserts result is Extract<AiImageResponse, { kind: 'image' }> {
  expect(result.kind).toBe('image');
}

describe('readAiImageResponse', () => {
  it('reads a successful image response', async () => {
    const result = await readAiImageResponse(new Response('image-bytes', { status: 200 }));

    expectImage(result);
    expect(await result.blob.text()).toBe('image-bytes');
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

  it('classifies an exhausted free grant by its machine-readable code', async () => {
    await expect(
      readAiImageResponse(
        new Response(
          JSON.stringify({
            ok: false,
            code: 'FREE_GRANT_EXHAUSTED',
            error: 'Add your own key.',
            remaining: 0,
          }),
          { status: 403 }
        )
      )
    ).resolves.toEqual({ kind: 'free-exhausted' });
  });

  it('classifies the exhausted daily limit by its machine-readable code', async () => {
    await expect(
      readAiImageResponse(
        new Response(
          JSON.stringify({
            ok: false,
            code: 'FREE_DAILY_LIMIT_EXHAUSTED',
            error: 'Free creations are unavailable today.',
          }),
          { status: 503 }
        )
      )
    ).resolves.toEqual({ kind: 'free-unavailable' });
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
