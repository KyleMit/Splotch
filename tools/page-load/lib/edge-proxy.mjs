// The two things Netlify's edge does to a static answer that the E2E host (e2e/server/netlifySite.ts)
// leaves out because no E2E assertion reads them: it compresses text with brotli or gzip, and it
// answers a repeat request for an unchanged file with 304 from its ETag. The page-load gate
// measures bytes on a throttled network, so a host that sends the 870 KB bundle uncompressed would
// time a download roughly four times the size of the one a visitor makes.
//
// This proxy sits in front of that host and adds exactly those two behaviors; every status, header
// and body the host chooses passes through otherwise.

import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

// Netlify does not publish the level it compresses at. Output size moves by a few percent across
// the middle of the range, under the gate's headroom, and a lower level keeps the first request for
// a large bundle from stalling behind the compressor.
const BROTLI_QUALITY = 6;

const TEXT_CONTENT_TYPE =
  /^(?:text\/|application\/(?:javascript|json|manifest\+json|xml)|image\/svg\+xml)/i;
// Headers that describe the connection or the body the host sent, which the proxy rewrites.
const REWRITTEN_HEADERS = ['connection', 'content-length', 'keep-alive', 'transfer-encoding'];
// What the proxy decides itself, so the host never sees the client's version of them. Host is not
// among them: the function's same-origin guard has to compare the origin the client really used.
const WITHHELD_REQUEST_HEADERS = [
  'accept-encoding',
  'connection',
  'if-modified-since',
  'if-none-match',
  'range',
];
const ETAG_DIGEST_HEX_LENGTH = 20;

const compress = {
  br: (body) =>
    promisify(brotliCompress)(body, {
      params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
    }),
  gzip: (body) => promisify(gzip)(body),
};

export function isCompressible(contentType) {
  return TEXT_CONTENT_TYPE.test(contentType ?? '');
}

/** The encoding to answer with: brotli when the client takes it, else gzip, else none. */
export function negotiateEncoding(acceptEncoding = '') {
  const accepted = new Set(
    acceptEncoding
      .split(',')
      .map((entry) => entry.trim().toLowerCase().split(';'))
      .filter(([, quality]) => quality === undefined || Number(quality.trim().slice(2)) > 0)
      .map(([name]) => name)
  );
  return ['br', 'gzip'].find((encoding) => accepted.has(encoding)) ?? null;
}

/** Whether an If-None-Match value names this validator, weak and strong forms alike. */
export function ifNoneMatchHits(ifNoneMatch, etag) {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  return ifNoneMatch.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}

function without(headers, names) {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !names.includes(name)));
}

function withVary(headers) {
  const vary = String(headers.vary ?? '');
  const names = vary
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.includes('*') || names.some((name) => name.toLowerCase() === 'accept-encoding')) {
    return headers;
  }
  return { ...headers, vary: [...names, 'Accept-Encoding'].join(', ') };
}

/**
 * The edge's answer to a request, given the host's: `{ status, headers, body }` in, the same shape
 * out. `encoded` holds the compressed bytes by digest and encoding, so a file is compressed once.
 */
export async function edgeAnswer(
  { method, requestHeaders },
  { status, headers, body },
  encoded = new Map()
) {
  if (method !== 'GET' || body.length === 0) {
    return { status, headers: without(headers, REWRITTEN_HEADERS), body };
  }
  const encoding =
    isCompressible(headers['content-type']) && !headers['content-encoding']
      ? negotiateEncoding(requestHeaders['accept-encoding'])
      : null;
  const digest = createHash('sha1').update(body).digest('hex').slice(0, ETAG_DIGEST_HEX_LENGTH);
  const base = without(headers, REWRITTEN_HEADERS);
  const etag =
    status === 200 && !headers.etag ? `"${digest}${encoding ? `-${encoding}` : ''}"` : headers.etag;
  const withEtag = etag ? { ...base, etag } : base;
  const varied = isCompressible(headers['content-type']) ? withVary(withEtag) : withEtag;

  if (status === 200 && ifNoneMatchHits(requestHeaders['if-none-match'], etag)) {
    return { status: 304, headers: without(varied, ['content-type']), body: Buffer.alloc(0) };
  }
  if (!encoding) return { status, headers: varied, body };
  const key = `${digest}:${encoding}`;
  if (!encoded.has(key)) encoded.set(key, await compress[encoding](body));
  return {
    status,
    headers: { ...varied, 'content-encoding': encoding },
    body: encoded.get(key),
  };
}

// The host is asked for the body even on HEAD: the E2E host answers a HEAD with a length of 0, and
// only the body says what length and encoding the GET would carry.
const hostMethod = (method) => (method === 'HEAD' ? 'GET' : method);

function askHost(origin, request) {
  return new Promise((resolve, reject) => {
    const forward = httpRequest(
      new URL(request.url ?? '/', origin),
      {
        method: hostMethod(request.method),
        headers: without(request.headers, WITHHELD_REQUEST_HEADERS),
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 502,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    forward.on('error', reject);
    request.pipe(forward);
  });
}

/** An HTTP server that answers each request from the host at `origin`, with the edge's behaviors. */
export function createEdgeProxy(origin) {
  const encoded = new Map();
  const answer = async (request) => {
    const fromHost = await askHost(origin, request);
    const edge = await edgeAnswer(
      { method: hostMethod(request.method), requestHeaders: request.headers },
      fromHost,
      encoded
    );
    // A 304 states no length; a HEAD states the length of the GET it stands for.
    if (edge.status === 304) return edge;
    return { ...edge, headers: { ...edge.headers, 'content-length': edge.body.length } };
  };
  return createServer((request, response) => {
    answer(request)
      .then(({ status, headers, body }) => {
        response.writeHead(status, headers);
        response.end(request.method === 'HEAD' ? undefined : body);
      })
      .catch((error) => {
        console.error('[page-load]', request.method, request.url, error);
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
  });
}
