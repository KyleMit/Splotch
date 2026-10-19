// Static host for the `rn-web` arm: serves an `npm run native:web:build` export, answering any
// path without a file with `index.html` (an SPA fallback, status 200). Records every request so a
// cell can assert what the arm fetched.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
};
const APP_SHELL = 'index.html';

function fileFor(root, pathname) {
  const candidate = resolve(root, `.${decodeURIComponent(pathname)}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

export function startRnWebServer({ root, port, host = '127.0.0.1' }) {
  const base = resolve(root);
  const served = [];
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const file = fileFor(base, pathname) ?? resolve(base, APP_SHELL);
    const fallback = file === resolve(base, APP_SHELL) && pathname !== `/${APP_SHELL}`;
    served.push({ pathname, fallback, at: Date.now() });
    response.statusCode = 200;
    response.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
    response.setHeader(
      'Cache-Control',
      pathname === '/sw.js' || extname(file) === '.html' ? 'no-cache' : 'public, max-age=0'
    );
    response.end(readFileSync(file));
  });
  return new Promise((ready) => {
    server.listen(port, host, () => ready({ server, served }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: { root: { type: 'string' }, port: { type: 'string' } },
    strict: true,
  });
  if (!values.root || !values.port) throw new Error('Usage: --root <export dir> --port <port>');
  const { server } = await startRnWebServer({ root: values.root, port: Number(values.port) });
  console.log(`rn-web serving ${values.root} at http://127.0.0.1:${server.address().port}`);
}
