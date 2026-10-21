import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const root = resolve('experiments/native-architecture/dist/web');
const staticRoot = resolve('web/static');
const port = Number(process.env.RN_HUNT_PORT ?? 6100);
if (port < 6100 || port > 6199) throw new Error('Use campaign port range');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/api/')) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end('{"ok":false,"error":"Local fixture required"}');
    return;
  }
  const base = pathname.startsWith('/coloring/') ? staticRoot : root;
  let file = resolve(base, `.${pathname}`);
  if (!file.startsWith(`${base}/`)) file = resolve(root, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(pathname)) {
      res.writeHead(404);
      res.end('Missing fixture asset');
      return;
    }
    file = resolve(root, 'index.html');
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(readFileSync(file));
});
server.listen(port, '127.0.0.1', () =>
  console.log(`RN hunt http://127.0.0.1:${port} pid=${process.pid}`)
);
