// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  asRecord,
  contentTypeOf,
  fail,
  readBodyWithinLimit,
  readJsonBody,
  throttled,
} from './http';

function jsonRequest(body: string) {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

describe('contentTypeOf', () => {
  it('normalizes a parameterized mixed-case header', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'Content-Type': '  Image/WebP ; charset=UTF-8' },
    });

    expect(contentTypeOf(request)).toBe('image/webp');
  });

  it('returns an empty string when the header is absent', () => {
    expect(contentTypeOf(new Request('http://localhost/api/test'))).toBe('');
  });
});

describe('readJsonBody', () => {
  it('returns the parsed object for a valid JSON body', async () => {
    expect(await readJsonBody(jsonRequest('{"code":"sunny-meadow"}'))).toEqual({
      ok: true,
      body: { code: 'sunny-meadow' },
    });
  });

  it('returns a valid array body without treating it as an object', async () => {
    const result = await readJsonBody(jsonRequest('["sunny-meadow"]'));

    expect(result).toEqual({ ok: true, body: ['sunny-meadow'] });
    if (result.ok) expect(asRecord(result.body)).toBeNull();
  });

  it('returns a canonical 400 response for a malformed body', async () => {
    const result = await readJsonBody(jsonRequest('not json'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({
      ok: false,
      error: 'Expected a JSON body',
    });
  });
});

describe('fail', () => {
  it('returns the canonical JSON failure response', async () => {
    const response = fail(403, 'Not allowed');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'Not allowed' });
  });
});

describe('readBodyWithinLimit', () => {
  it('rejects an oversized declared length without consuming the body', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'Content-Length': '5' },
      body: 'tiny',
    });
    const arrayBuffer = vi.spyOn(request, 'arrayBuffer');

    expect(await readBodyWithinLimit(request, 4)).toEqual({ ok: false });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it.each([
    ['absent', undefined],
    ['lower than the actual size', '2'],
  ])('rejects actual bytes over the cap when Content-Length is %s', async (_, contentLength) => {
    const headers = contentLength === undefined ? undefined : { 'Content-Length': contentLength };
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers,
      body: 'oversized',
    });

    expect(await readBodyWithinLimit(request, 8)).toEqual({ ok: false });
  });

  it('counts multibyte UTF-8 payloads by bytes instead of string length', async () => {
    const body = 'éé';
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body,
    });

    expect(body.length).toBe(2);
    expect(await readBodyWithinLimit(request, 3)).toEqual({ ok: false });
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
