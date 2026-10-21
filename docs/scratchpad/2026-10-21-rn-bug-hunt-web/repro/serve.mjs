import { createServer } from 'node:http';
import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const root = resolve('experiments/native-architecture/dist/web');
const coloring = resolve('web/static/coloring');
const port = Number(process.env.HUNT_PORT ?? 6150);
const requestLog = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web/evidence/host.jsonl');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
};

function existingFile(base, pathname) {
  const file = resolve(base, `.${decodeURIComponent(pathname)}`);
  if (file !== base && !file.startsWith(base + sep)) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const isColoring = pathname.startsWith('/coloring/');
  const file = isColoring
    ? existingFile(coloring, pathname.slice('/coloring'.length))
    : existingFile(root, pathname);
  const blocked = pathname.startsWith('/api/');
  const missingAsset = isColoring && !file;
  const selected = file ?? resolve(root, 'index.html');
  const status = blocked ? 503 : missingAsset ? 404 : 200;
  appendFileSync(
    requestLog,
    JSON.stringify({
      at: new Date().toISOString(),
      pathname,
      status,
      fallback: !file && status === 200,
    }) + '\n'
  );
  response.writeHead(status, {
    'Content-Type':
      status === 200 ? (types[extname(selected)] ?? 'application/octet-stream') : 'text/plain',
    'Cache-Control': 'no-cache',
  });
  response.end(status === 200 ? readFileSync(selected) : 'Local harness: unavailable');
});
server.listen(port, '127.0.0.1', () =>
  console.log(`RN web http://127.0.0.1:${port}; coloring mounted; pid ${process.pid}`)
);
