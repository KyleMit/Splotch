import { createServer, request as httpRequest } from 'node:http';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  createEdgeProxy,
  edgeAnswer,
  ifNoneMatchHits,
  isCompressible,
  negotiateEncoding,
} from '../lib/edge-proxy.mjs';

const BUNDLE = Buffer.from('export const answer = 42;\n'.repeat(400));
const PICTURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const CHROME_ACCEPT_ENCODING = 'gzip, deflate, br, zstd';

const hostAnswer = (contentType, body, extra = {}) => ({
  status: 200,
  headers: { 'content-type': contentType, 'content-length': String(body.length), ...extra },
  body,
});
const get = (acceptEncoding = CHROME_ACCEPT_ENCODING, extra = {}) => ({
  method: 'GET',
  requestHeaders: { 'accept-encoding': acceptEncoding, ...extra },
});

describe('negotiateEncoding', () => {
  it.each([
    [CHROME_ACCEPT_ENCODING, 'br'],
    ['gzip, deflate', 'gzip'],
    ['gzip;q=0.5, br;q=0.9', 'br'],
    ['br;q=0, gzip', 'gzip'],
    ['identity', null],
    ['gzip;q=0', null],
    ['', null],
    [undefined, null],
  ])('answers %j with %j', (header, encoding) => {
    expect(negotiateEncoding(header)).toBe(encoding);
  });
});

describe('isCompressible', () => {
  it.each([
    'text/html; charset=UTF-8',
    'application/javascript',
    'application/json',
    'application/manifest+json',
    'image/svg+xml',
  ])('compresses %s', (contentType) => {
    expect(isCompressible(contentType)).toBe(true);
  });

  it.each(['image/png', 'audio/mpeg', 'font/woff2', 'image/x-icon', undefined])(
    'leaves %s as it is',
    (contentType) => {
      expect(isCompressible(contentType)).toBe(false);
    }
  );
});

describe('ifNoneMatchHits', () => {
  it('matches a validator named alone, in a list, weakly, or by wildcard', () => {
    expect(ifNoneMatchHits('"a"', '"a"')).toBe(true);
    expect(ifNoneMatchHits('"b", "a"', '"a"')).toBe(true);
    expect(ifNoneMatchHits('W/"a"', '"a"')).toBe(true);
    expect(ifNoneMatchHits('*', '"a"')).toBe(true);
  });

  it('misses another validator and an absent header', () => {
    expect(ifNoneMatchHits('"b"', '"a"')).toBe(false);
    expect(ifNoneMatchHits(undefined, '"a"')).toBe(false);
  });
});

describe('edgeAnswer', () => {
  it('compresses text with brotli and says so', async () => {
    const answer = await edgeAnswer(get(), hostAnswer('application/javascript', BUNDLE));

    expect(answer.headers['content-encoding']).toBe('br');
    expect(answer.headers.vary).toBe('Accept-Encoding');
    expect(answer.body.length).toBeLessThan(BUNDLE.length / 10);
    expect(brotliDecompressSync(answer.body)).toEqual(BUNDLE);
  });

  it('falls back to gzip for a client that does not take brotli', async () => {
    const answer = await edgeAnswer(get('gzip'), hostAnswer('text/css', BUNDLE));

    expect(answer.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(answer.body)).toEqual(BUNDLE);
  });

  it('sends the bytes as they are to a client that takes neither', async () => {
    const answer = await edgeAnswer(get('identity'), hostAnswer('text/html', BUNDLE));

    expect(answer.headers['content-encoding']).toBeUndefined();
    expect(answer.body).toEqual(BUNDLE);
  });

  it('does not compress what is not text', async () => {
    const answer = await edgeAnswer(get(), hostAnswer('image/png', PICTURE));

    expect(answer.headers['content-encoding']).toBeUndefined();
    expect(answer.headers.vary).toBeUndefined();
    expect(answer.body).toEqual(PICTURE);
  });

  it('leaves an answer the host already encoded alone', async () => {
    const answer = await edgeAnswer(
      get(),
      hostAnswer('application/javascript', BUNDLE, { 'content-encoding': 'zstd' })
    );

    expect(answer.headers['content-encoding']).toBe('zstd');
    expect(answer.body).toEqual(BUNDLE);
  });

  it('keeps the host status and headers, and rewrites only the length', async () => {
    const answer = await edgeAnswer(
      get(),
      hostAnswer('text/html', BUNDLE, {
        'cache-control': 'no-store',
        'transfer-encoding': 'chunked',
        vary: 'Origin',
      })
    );

    expect(answer.status).toBe(200);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.headers['transfer-encoding']).toBeUndefined();
    expect(answer.headers['content-length']).toBeUndefined();
    expect(answer.headers.vary).toBe('Origin, Accept-Encoding');
  });

  it('gives a 200 an ETag per representation, and no other status one', async () => {
    const [brotli, gzipped, plain, missing] = await Promise.all([
      edgeAnswer(get(), hostAnswer('text/html', BUNDLE)),
      edgeAnswer(get('gzip'), hostAnswer('text/html', BUNDLE)),
      edgeAnswer(get('identity'), hostAnswer('text/html', BUNDLE)),
      edgeAnswer(get(), { ...hostAnswer('text/html', BUNDLE), status: 404 }),
    ]);

    expect(new Set([brotli, gzipped, plain].map(({ headers }) => headers.etag)).size).toBe(3);
    expect(missing.headers.etag).toBeUndefined();
    expect(missing.status).toBe(404);
  });

  it('answers 304 with no body for a validator it issued', async () => {
    const first = await edgeAnswer(get(), hostAnswer('text/html', BUNDLE));
    const again = await edgeAnswer(
      get(CHROME_ACCEPT_ENCODING, { 'if-none-match': first.headers.etag }),
      hostAnswer('text/html', BUNDLE, { 'cache-control': 'no-cache' })
    );

    expect(again.status).toBe(304);
    expect(again.body).toHaveLength(0);
    expect(again.headers.etag).toBe(first.headers.etag);
    expect(again.headers['cache-control']).toBe('no-cache');
  });

  it('sends the full answer once the file has changed since the validator was issued', async () => {
    const first = await edgeAnswer(get(), hostAnswer('text/html', BUNDLE));
    const changed = await edgeAnswer(
      get(CHROME_ACCEPT_ENCODING, { 'if-none-match': first.headers.etag }),
      hostAnswer('text/html', Buffer.concat([BUNDLE, Buffer.from('// edited')]))
    );

    expect(changed.status).toBe(200);
    expect(changed.headers.etag).not.toBe(first.headers.etag);
  });

  it('compresses each file once however often it is asked for', async () => {
    const encoded = new Map();
    await edgeAnswer(get(), hostAnswer('text/html', BUNDLE), encoded);
    await edgeAnswer(get(), hostAnswer('text/html', BUNDLE), encoded);

    expect(encoded.size).toBe(1);
  });

  it('passes a POST through untouched', async () => {
    const post = { method: 'POST', requestHeaders: { 'accept-encoding': 'br' } };

    const answer = await edgeAnswer(post, hostAnswer('text/html', BUNDLE));

    expect(answer.headers['content-encoding']).toBeUndefined();
    expect(answer.body).toEqual(BUNDLE);
  });
});

function listening(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      onTestFinished(
        () =>
          new Promise((closed) => {
            server.closeAllConnections();
            server.close(closed);
          })
      );
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function fetchRaw(origin, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(new URL(path, origin), { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks),
        })
      );
    });
    request.on('error', reject);
    request.end(body);
  });
}

describe('createEdgeProxy', () => {
  async function proxiedHost() {
    const seen = [];
    const host = createServer((request, response) => {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        seen.push({ ...request.headers, method: request.method, body: Buffer.concat(chunks) });
        if (request.url === '/app.js') {
          response.setHeader('Content-Type', 'application/javascript');
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          // Like e2e/server/netlifySite.ts, which answers a HEAD with no body and so a length of 0.
          response.end(request.method === 'HEAD' ? undefined : BUNDLE);
        } else if (request.url === '/api/echo') {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ host: request.headers.host }));
        } else {
          response.statusCode = 404;
          response.setHeader('Content-Type', 'text/html');
          response.end('<p>not found</p>');
        }
      });
    });
    const edge = await listening(createEdgeProxy(await listening(host)));
    return { edge, seen };
  }

  it('serves brotli over a real connection and revalidates with 304', async () => {
    const { edge } = await proxiedHost();

    const first = await fetchRaw(edge, {
      path: '/app.js',
      headers: { 'accept-encoding': CHROME_ACCEPT_ENCODING },
    });
    const again = await fetchRaw(edge, {
      path: '/app.js',
      headers: { 'accept-encoding': CHROME_ACCEPT_ENCODING, 'if-none-match': first.headers.etag },
    });

    expect(first.status).toBe(200);
    expect(first.headers['content-encoding']).toBe('br');
    expect(first.headers['content-length']).toBe(String(first.body.length));
    expect(first.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(brotliDecompressSync(first.body)).toEqual(BUNDLE);
    expect(again.status).toBe(304);
    expect(again.body).toHaveLength(0);
    expect(again.headers['content-length']).toBeUndefined();
  });

  it('answers a HEAD with the headers its GET carries, and no body', async () => {
    const { edge } = await proxiedHost();
    const headers = { 'accept-encoding': CHROME_ACCEPT_ENCODING };

    const get = await fetchRaw(edge, { path: '/app.js', headers });
    const head = await fetchRaw(edge, { path: '/app.js', method: 'HEAD', headers });

    expect(head.status).toBe(200);
    expect(head.body).toHaveLength(0);
    expect(head.headers['content-length']).toBe(String(get.body.length));
    expect(head.headers['content-encoding']).toBe('br');
    expect(head.headers.etag).toBe(get.headers.etag);
  });

  it('keeps the host status for a missing file', async () => {
    const { edge } = await proxiedHost();

    const missing = await fetchRaw(edge, { path: '/nope', headers: { 'accept-encoding': 'br' } });

    expect(missing.status).toBe(404);
    expect(brotliDecompressSync(missing.body).toString()).toBe('<p>not found</p>');
  });

  it("hands the host the client's own Host and withholds its conditional headers", async () => {
    const { edge, seen } = await proxiedHost();
    const origin = new URL(edge);

    await fetchRaw(edge, {
      path: '/api/echo',
      method: 'POST',
      headers: { 'if-none-match': '"x"', 'accept-encoding': 'br' },
      body: 'payload',
    });

    expect(seen.at(-1).host).toBe(origin.host);
    expect(seen.at(-1)['if-none-match']).toBeUndefined();
    expect(seen.at(-1)['accept-encoding']).toBeUndefined();
    expect(seen.at(-1).body.toString()).toBe('payload');
  });

  it('reports a host that is not there as a 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const edge = await listening(createEdgeProxy('http://127.0.0.1:9'));

    const answer = await fetchRaw(edge);

    expect(answer.status).toBe(502);
  });
});
