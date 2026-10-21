// Netlify-shaped static server for the cutover rehearsal: a static file wins (preferStatic),
// with pretty URLs (/privacy -> privacy.html); every other path stands in for the SvelteKit
// catch-all function. The root can be switched at runtime to simulate a deploy landing.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const roots = JSON.parse(process.argv[2]);
const port = Number(process.argv[3]);
let current = Object.keys(roots)[0];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};
const isFile = (path) => existsSync(path) && statSync(path).isFile();
function staticFile(root, pathname) {
  const clean = decodeURIComponent(pathname);
  const candidates =
    clean === '/'
      ? ['index.html']
      : [clean.slice(1), `${clean.slice(1)}.html`, `${clean.slice(1)}/index.html`];
  return candidates.map((c) => join(root, c)).find(isFile);
}
createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__switch') {
    current = url.searchParams.get('root');
    res.end(current);
    return;
  }
  const file = staticFile(roots[current], url.pathname);
  if (file) {
    const noCache = /\.(html|json)$|sw\.js$/.test(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=0',
      'X-Served-By': `static:${current}`,
    });
    res.end(readFileSync(file));
    return;
  }
  res.writeHead(url.pathname.startsWith('/api/') ? 200 : 404, {
    'Content-Type': 'text/plain',
    'X-Served-By': `function:${current}`,
  });
  res.end(`function stub ${url.pathname}`);
}).listen(port, '127.0.0.1', () => console.log(`ready ${port}`));
