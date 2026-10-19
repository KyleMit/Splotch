// Static brotli server for a built web export: hashed assets immutable, documents no-cache.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const [root, portArg] = process.argv.slice(2);
const port = Number(portArg);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg']);
const cache = new Map();

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, clean);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(root, 'index.html');
  return file;
}

createServer((req, res) => {
  const file = resolvePath(req.url);
  const ext = extname(file);
  const accepts = /\bbr\b/.test(req.headers['accept-encoding'] ?? '');
  let body = readFileSync(file);
  // Revalidation answers 304 as a CDN does, so a repeat visit does not re-download no-cache files.
  const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag });
    return res.end();
  }
  const headers = { 'content-type': TYPES[ext] ?? 'application/octet-stream' };
  headers['cache-control'] =
    req.url.startsWith('/_expo/static/') ||
    req.url.startsWith('/_app/immutable/') ||
    req.url.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
  if (accepts && COMPRESSIBLE.has(ext)) {
    const key = file;
    if (!cache.has(key))
      cache.set(
        key,
        brotliCompressSync(body, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        })
      );
    body = cache.get(key);
    headers['content-encoding'] = 'br';
    headers.vary = 'accept-encoding';
  }
  headers.etag = etag;
  headers['content-length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
