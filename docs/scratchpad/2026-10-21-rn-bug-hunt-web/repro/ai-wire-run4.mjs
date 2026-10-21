import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { connect, open, boot, stroke, button, expect, ENGINE, OUT } from './driver.mjs';
import { settings, land } from './ui.mjs';
import { AI_REPLIES } from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';

const FIXTURE_IMAGE_TIMEOUT_MS = 15_000;
const WIRE_PORT_FIRST = 6152;
const WIRE_PORT_LAST = 6159;

const root = resolve('experiments/native-architecture/dist/web');
const wire = [];
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  try {
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (url.pathname === '/api/generate-image') {
        const metadata = await sharp(body).metadata();
        wire.push({
          path: url.pathname,
          method: request.method,
          contentType: request.headers['content-type'],
          bytes: body.length,
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          sha256: createHash('sha256').update(body).digest('hex'),
        });
        const reply = AI_REPLIES.picture()();
        response.writeHead(reply.status, { 'Content-Type': reply.contentType, ...reply.headers });
        response.end(reply.body);
        return;
      }
      const reply =
        url.pathname === '/api/free-generation-grant'
          ? { ok: true, remaining: 10, limit: 10 }
          : { ok: false, error: 'Wire fixture: endpoint not modeled' };
      response.writeHead(reply.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reply));
      return;
    }
    const file = resolve(
      root,
      `.${url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)}`
    );
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: false, error: String(error) }));
  }
});
let port;
for (let candidate = WIRE_PORT_FIRST; candidate <= WIRE_PORT_LAST; candidate++) {
  const error = await new Promise((resolve) => {
    const failed = (error) => {
      server.off('listening', ready);
      resolve(error);
    };
    const ready = () => {
      server.off('error', failed);
      resolve(null);
    };
    server.once('error', failed);
    server.once('listening', ready);
    server.listen(candidate, '127.0.0.1');
  });
  if (!error) {
    port = candidate;
    break;
  }
  if (error.code !== 'EADDRINUSE') throw error;
}
if (!port) throw new Error('No unused wire-fixture port in 6152–6159');
const base = `http://127.0.0.1:${port}`;
const receipt = {
  at: new Date().toISOString(),
  engine: ENGINE,
  port,
  pid: process.pid,
  fixture: 'AI-1 AI_REPLIES.picture',
  wire,
};
let browser;
try {
  browser = await connect();
  const s = await open(browser, 'phone');
  s.base = base;
  const external = [];
  await s.ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  try {
    await boot(s);
    await settings(s, 'AI Art');
    for (const [name, value] of [
      ['Create AI Images', true],
      ['Customize AI Style', true],
      ['Auto-Save AI Images', false],
    ]) {
      const control = s.page.getByRole('switch', { name, exact: true });
      if ((await control.isChecked()) !== value) await control.click();
    }
    await s.page.keyboard.press('Escape');
    await expect(s.page.getByRole('dialog')).toHaveCount(0);
    await stroke(s);
    await s.page.getByRole('button', { name: /Create AI image/ }).click();
    await land(s);
    await button(s.page, 'Sticker').click();
    await expect(button(s.page, 'Download')).toBeVisible({ timeout: FIXTURE_IMAGE_TIMEOUT_MS });
    expect(wire).toHaveLength(1);
    expect(wire[0].bytes).toBeGreaterThan(0);
    expect(wire[0].width).toBeGreaterThan(0);
    expect(wire[0].height).toBeGreaterThan(0);
    expect(external).toEqual([]);
    expect(s.errors).toEqual([]);
    receipt.pass = true;
    receipt.external = external;
    await s.page.screenshot({ path: `${OUT}/evidence/run4/ai-wire-${ENGINE}.png` });
  } finally {
    await s.ctx.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
  receipt.serverStopped = true;
  writeFileSync(
    `${OUT}/evidence/run4/ai-wire-${ENGINE}.json`,
    JSON.stringify(receipt, null, 2) + '\n'
  );
}
console.log(JSON.stringify(receipt));
