#!/usr/bin/env node
// Serve tools/gpu-crayon/output/ over the LAN so the contact sheet can be read
// on the device you would actually judge a crayon on — a phone or an iPad —
// rather than on the machine that captured it.
//
// The harness itself is served by vite (`npm run dev -- --host`); this only
// carries the static capture output, which vite's root does not include.
//
// Usage: node tools/gpu-crayon/serve-output.mjs [--port 5232] [--host 0.0.0.0]

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isMain } from '../lib/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'output');
const DEFAULT_PORT = 5232;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return 'localhost';
}

// Resolve inside ROOT only. This binds to every interface by default, so a
// path that escapes the output directory would expose the whole checkout to
// anything on the network.
function resolveWithin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const requested = path.resolve(ROOT, `.${decoded === '/' ? '/contact-sheet.html' : decoded}`);
  return requested === ROOT || requested.startsWith(`${ROOT}${path.sep}`) ? requested : null;
}

export function serveOutput({ port = DEFAULT_PORT, host = '0.0.0.0' } = {}) {
  const server = createServer(async (request, response) => {
    const file = resolveWithin(request.url ?? '/');
    if (!file) {
      response.writeHead(403).end('outside the output directory');
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      response.writeHead(200, {
        'content-type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
        'content-length': info.size,
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end('not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      console.log(`contact sheet  http://${lanAddress()}:${port}/`);
      console.log(`capture files  http://${lanAddress()}:${port}/results.json`);
      resolve(server);
    });
  });
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { port: { type: 'string' }, host: { type: 'string' } },
  });
  await serveOutput({
    port: values.port ? Number(values.port) : DEFAULT_PORT,
    host: values.host ?? '0.0.0.0',
  });
}
