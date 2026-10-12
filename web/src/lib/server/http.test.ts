// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { error } from '@sveltejs/kit';
import {
  apiHandler,
  asRecord,
  contentTypeOf,
  fail,
  formStringField,
  readBodyWithinLimit,
  readFormBody,
  readJsonBody,
  stringField,
  throttled,
  unreadableFormBody,
  type JsonBodyResult,
} from './http';

// Narrows the result so an assertion about the parsed body reads unconditionally. Branching on
// `result.ok` instead would let that assertion be skipped rather than fail.
function expectParsedBody(
  result: JsonBodyResult
): asserts result is Extract<JsonBodyResult, { ok: true }> {
  expect(result.ok, 'the body did not parse').toBe(true);
}

function jsonRequest(body: string, headers: HeadersInit = {}) {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

function chunkedRequest(chunks: string[], contentLength?: string) {
  const encoded = chunks.map((chunk) => new TextEncoder().encode(chunk));
  let pulls = 0;
  let cancellations = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = encoded[pulls];
        pulls += 1;
        if (chunk) controller.enqueue(chunk);
        if (pulls === encoded.length) controller.close();
      },
      cancel() {
        cancellations += 1;
      },
    },
    { highWaterMark: 0 }
  );
  const request = new Request('http://localhost/api/test', {
    method: 'POST',
    headers: contentLength === undefined ? undefined : { 'Content-Length': contentLength },
    body,
    duplex: 'half',
  } as RequestInit);
  return {
    request,
    pulls: () => pulls,
    cancellations: () => cancellations,
  };
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
    expect(await readJsonBody(jsonRequest('{"code":"sunny-meadow"}'), 64)).toEqual({
      ok: true,
      body: { code: 'sunny-meadow' },
    });
  });

  it('returns a valid array body without treating it as an object', async () => {
    const result = await readJsonBody(jsonRequest('["sunny-meadow"]'), 64);

    expectParsedBody(result);
    expect(result.body).toEqual(['sunny-meadow']);
    expect(asRecord(result.body)).toBeNull();
  });

  it('returns a canonical 400 response for a malformed body', async () => {
    const result = await readJsonBody(jsonRequest('not json'), 64);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({
      ok: false,
      error: 'Expected a JSON body',
    });
  });

  it('accepts a multibyte body at its exact byte limit', async () => {
    const raw = '{"label":"é"}';

    expect(await readJsonBody(jsonRequest(raw), Buffer.byteLength(raw))).toEqual({
      ok: true,
      body: { label: 'é' },
    });
  });

  it('accepts a leading UTF-8 byte-order mark like Request.json', async () => {
    const raw = '\uFEFF{"code":"sunny-meadow"}';

    expect(await readJsonBody(jsonRequest(raw), Buffer.byteLength(raw))).toEqual({
      ok: true,
      body: { code: 'sunny-meadow' },
    });
  });

  it('maps a failed body stream to the malformed-body response', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"code"'));
      },
      pull(controller) {
        controller.error(new Error('client aborted'));
      },
    });
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);

    const result = await readJsonBody(request, 64);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(await result.response.json()).toEqual({
      ok: false,
      error: 'Expected a JSON body',
    });
  });

  it('preserves a platform body-limit failure as a 413', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(Object.assign(new Error('platform cap'), { status: 413 }));
      },
    });
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);

    const result = await readJsonBody(request, 64);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(413);
    expect(await result.response.json()).toEqual({
      ok: false,
      error: 'Request body is too large',
    });
  });

  it('returns a canonical 413 response for an oversized body', async () => {
    const result = await readJsonBody(jsonRequest('{"code":"sunny-meadow"}'), 8);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(413);
    expect(await result.response.json()).toEqual({
      ok: false,
      error: 'Request body is too large',
    });
  });
});

describe('readFormBody', () => {
  type FormBodyResult = Awaited<ReturnType<typeof readFormBody>>;

  function expectForm(
    result: FormBodyResult
  ): asserts result is Extract<FormBodyResult, { ok: true }> {
    expect(result.ok, 'the form did not parse').toBe(true);
  }

  function formRequest(body: BodyInit, headers: HeadersInit = {}) {
    return new Request('http://localhost/feedback', { method: 'POST', headers, body });
  }

  it('parses a multipart body within the cap, file parts included', async () => {
    const body = new FormData();
    body.set('message', 'Add a glitter brush');
    body.set('attachment', new Blob(['x'], { type: 'text/plain' }));

    const result = await readFormBody(formRequest(body), 4096);

    expectForm(result);
    expect(result.form.get('message')).toBe('Add a glitter brush');
    expect(result.form.get('attachment')).toBeInstanceOf(Blob);
  });

  it('parses the urlencoded body a browser posts without JavaScript', async () => {
    const result = await readFormBody(
      formRequest(new URLSearchParams({ 'access-key': 'a&b=c' })),
      64
    );

    expectForm(result);
    expect(result.form.get('access-key')).toBe('a&b=c');
  });

  it('refuses a body over the cap before parsing it', async () => {
    const body = new URLSearchParams({ message: 'x'.repeat(64) });

    expect(await readFormBody(formRequest(body), 32)).toEqual({ ok: false, reason: 'too-large' });
  });

  it('refuses a streamed body at the chunk that crosses the cap', async () => {
    const stream = chunkedRequest(['message=12', '3456789', 'unread']);

    expect(await readFormBody(stream.request, 12)).toEqual({ ok: false, reason: 'too-large' });
    expect(stream.pulls()).toBe(2);
  });

  it('keeps a platform body-limit failure a too-large refusal', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(Object.assign(new Error('platform cap'), { status: 413 }));
      },
    });
    const request = new Request('http://localhost/feedback', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);

    expect(await readFormBody(request, 64)).toEqual({ ok: false, reason: 'too-large' });
  });

  it.each([
    ['a multipart body missing its boundary', 'multipart/form-data', '--x\r\n'],
    ['a body that is not a form at all', 'text/plain', 'message=hi'],
  ])('refuses %s as malformed', async (_label, contentType, body) => {
    expect(await readFormBody(formRequest(body, { 'Content-Type': contentType }), 64)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('unreadableFormBody', () => {
  it('words each refusal as the JSON doors word it', () => {
    expect(unreadableFormBody('too-large')).toEqual({
      status: 413,
      message: 'Request body is too large',
    });
    expect(unreadableFormBody('malformed')).toEqual({
      status: 400,
      message: 'Expected a form body',
    });
  });
});

describe('fail', () => {
  it('returns the canonical JSON failure response', async () => {
    const response = fail(403, 'Not allowed');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'Not allowed' });
  });

  it('carries extra headers alongside the JSON body', () => {
    const response = fail(429, 'Slow down', { 'Retry-After': '9' });

    expect(response.headers.get('Retry-After')).toBe('9');
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });
});

describe('apiHandler', () => {
  const event = { url: { pathname: '/api/test' } };

  it('converts a thrown SvelteKit error into the canonical failure shape', async () => {
    const handler = apiHandler(async () => {
      throw error(413, 'Image is too large');
    });

    const response = await handler(event);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: 'Image is too large' });
  });

  it('returns the handler response untouched', async () => {
    const success = fail(400, 'Handled inside');
    const handler = apiHandler(async () => success);

    expect(await handler(event)).toBe(success);
  });

  it('normalizes a non-HttpError to the canonical 500 and keeps the server log', async () => {
    const boom = new Error('boom');
    const handler = apiHandler(async () => {
      throw boom;
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(event);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: 'Something went wrong.' });
    expect(logged).toHaveBeenCalledWith(
      '[server error]',
      '/api/test',
      500,
      expect.stringContaining('Error: boom\n    at ')
    );
    logged.mockRestore();
  });

  // A grant-store fault escapes the free path uncaught, and a store error can
  // quote the blob key it failed on: the installation id.
  it('keeps an installation id quoted by the failure out of the server log', async () => {
    const installationId = 'e'.repeat(64);
    const handler = apiHandler(async () => {
      throw new Error(`free-generation-grants get ${installationId} failed`);
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(event);

    const line = logged.mock.calls.flat().map(String).join(' ');
    expect(line).toContain('free-generation-grants get <redacted id> failed');
    expect(line).not.toContain(installationId);
    logged.mockRestore();
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
  ])('stops streamed bytes at the cap when Content-Length is %s', async (_, length) => {
    const stream = chunkedRequest(['1234', '56789', 'unread'], length);

    expect(await readBodyWithinLimit(stream.request, 8)).toEqual({ ok: false });
    expect(stream.pulls()).toBe(2);
    expect(stream.cancellations()).toBe(0);
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

  it('accepts a streamed body at the exact byte limit', async () => {
    const stream = chunkedRequest(['12', '34']);

    expect(await readBodyWithinLimit(stream.request, 4)).toEqual({
      ok: true,
      bytes: Buffer.from('1234'),
    });
    expect(stream.cancellations()).toBe(0);
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

describe('stringField', () => {
  it('returns a present string value verbatim', () => {
    expect(stringField({ key: '  sunny-meadow  ' }, 'key')).toBe('  sunny-meadow  ');
  });

  it.each<[string, unknown]>([
    ['a number', 0],
    ['an object', {}],
    ['an array', []],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
  ])('coerces %s to an empty string', (_, value) => {
    expect(stringField({ key: value }, 'key')).toBe('');
  });

  it('returns an empty string for a field the body does not carry', () => {
    expect(stringField({ other: 'sunny-meadow' }, 'key')).toBe('');
  });

  it.each<[string, unknown]>([
    ['a string', 'sunny-meadow'],
    ['a number', 7],
    ['null', null],
    ['undefined', undefined],
  ])('returns an empty string when the body is %s rather than an object', (_, body) => {
    expect(stringField(body, 'key')).toBe('');
  });

  it('returns an empty string for an array body that asRecord rejects', () => {
    const body = [{ key: 'sunny-meadow' }];

    expect(asRecord(body)).toBeNull();
    expect(stringField(body, 'key')).toBe('');
  });

  it('returns a present empty string, which callers cannot tell from a coerced one', () => {
    const present = stringField({ key: '' }, 'key');

    expect(present).toBe('');
    expect(present).toBe(stringField({ key: 0 }, 'key'));
  });
});

describe('formStringField', () => {
  it('returns a present text field verbatim', () => {
    const form = new FormData();
    form.set('token', '  sunny-meadow  ');

    expect(formStringField(form, 'token')).toBe('  sunny-meadow  ');
  });

  // String(file) would read "[object File]" and hand that on as the value.
  it.each<[string, (form: FormData) => void]>([
    ['a file part', (form) => form.set('token', new Blob(['sunny-meadow']))],
    ['a missing field', () => {}],
  ])('reads %s as empty', (_, fill) => {
    const form = new FormData();
    fill(form);

    expect(formStringField(form, 'token')).toBe('');
  });
});
