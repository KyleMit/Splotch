// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readJsonBody, throttled } from './http';

function jsonRequest(body: string) {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

describe('readJsonBody', () => {
  it('returns the parsed object for a valid JSON body', async () => {
    expect(await readJsonBody(jsonRequest('{"code":"sunny-meadow"}'))).toEqual({
      code: 'sunny-meadow',
    });
  });

  it('throws a 400 HttpError for a malformed body', async () => {
    await expect(readJsonBody(jsonRequest('not json'))).rejects.toMatchObject({
      status: 400,
      body: { message: 'Expected a JSON body' },
    });
  });
});

describe('throttled', () => {
  it('returns the standard JSON 429 with a Retry-After header', async () => {
    const res = throttled(12);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('12');
    expect(await res.json()).toEqual({
      ok: false,
      error: 'Too many attempts. Please wait 12s.',
    });
  });
});
