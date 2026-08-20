#!/usr/bin/env node
// Drives the generated contact sheet through every option × every scripted
// gesture in a real browser and fails on anything that renders silence.
//
// The rig is all Web Audio, so a broken graph — a node left disconnected, a clip
// that decoded to nothing, a host CSP that refuses the self-contained build's
// data: URIs — produces a page that looks perfect and makes no sound. Headless
// Chromium runs the audio clock for real, so an AnalyserNode on the master bus
// catches it.
//
// Three separate checks, because a whole-gesture peak hides most of this: every
// clip must be audible when played alone, the drag must make sound, and the
// release must make sound of its own on top of the drag's fade.
//
// Usage:
//   node audit.mjs                      audits the committed scrapbook build
//   node audit.mjs --standalone <file>  audits a --inline build under a strict
//                                       CSP, the way an artifact host serves it
// Set CHROMIUM_PATH when Playwright's own browser download is unavailable.

import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEET_DIR = resolve(HERE, '../../../scrapbook/sound-design/clear-sound-contact-sheet');
const PORT = Number(process.env.SPLOTCH_SOUND_AUDIT_PORT ?? 4185);
const SILENCE_PEAK = 0.02;
// Summed voices can run past unity and clip without ever going quiet, which the
// silence checks below would happily pass.
const CLIPPING_PEAK = 0.99;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg' };
// What a locked-down artifact host sends. connect-src without `data:` is the
// specific rule that made every recorded clip fail to load while the page
// reported itself healthy.
const STRICT_CSP =
  "default-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' data: blob:";

const { values: args } = parseArgs({
  options: { standalone: { type: 'string' } },
  allowPositionals: false,
});

const standalone = args.standalone ? await readFile(resolve(args.standalone), 'utf8') : null;

const server = createServer(async (request, response) => {
  if (standalone) {
    response
      .writeHead(200, { 'content-type': 'text/html', 'content-security-policy': STRICT_CSP })
      .end(standalone);
    return;
  }
  const requested = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
  const path = join(SHEET_DIR, requested === '/' ? 'index.html' : requested);
  if (!path.startsWith(SHEET_DIR) || !(await stat(path).catch(() => null))) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(response);
});
await new Promise((done) => server.listen(PORT, '127.0.0.1', done));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error)));
// The browser asks for /favicon.ico on its own; a miss there says nothing about
// the page, and the scrapbook chrome does not emit one.
const isFavicon = (url) => (url ?? '').endsWith('/favicon.ico');
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (isFavicon(message.location()?.url)) return;
  consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (!response.ok() && !isFavicon(response.url())) {
    consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
  }
});

console.log(standalone ? `Auditing ${args.standalone} under a strict CSP` : `Auditing ${SHEET_DIR}`);
await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.click('[data-enable]');
await page.waitForFunction(() => document.body.classList.contains('audio-ready'));

const failures = [];

const clipNames = Object.keys(await page.evaluate(() => window.__sheetClips()));
const mute = [];
for (const name of clipNames) {
  const { peak } = await page.evaluate((clip) => window.__sheetPlayClip(clip), name);
  if (peak < SILENCE_PEAK) mute.push(`${name} (peak ${peak.toFixed(4)})`);
}
console.log(`clips: ${clipNames.length - mute.length}/${clipNames.length} audible when played`);
failures.push(...mute.map((entry) => `clip plays silent: ${entry}`));

const options = await page.evaluate(() => window.__sheetOptions);
const presets = await page.evaluate(() => window.__sheetPresets);
for (const option of options) {
  const columns = [];
  for (const preset of presets) {
    const { drag, release } = await page.evaluate(
      ([o, p]) => window.__sheetAudit(o, p),
      [option, preset]
    );
    columns.push(`${preset} ${drag.peak.toFixed(2)}→${release.peak.toFixed(2)}`);
    if (drag.peak < SILENCE_PEAK) {
      failures.push(`silent drag: ${option} / ${preset} (peak ${drag.peak.toFixed(4)})`);
    }
    if (release.peak < SILENCE_PEAK) {
      failures.push(`silent release: ${option} / ${preset} (peak ${release.peak.toFixed(4)})`);
    }
    const loudest = Math.max(drag.peak, release.peak);
    if (loudest > CLIPPING_PEAK) {
      failures.push(`clipping: ${option} / ${preset} (peak ${loudest.toFixed(3)})`);
    }
  }
  console.log(`${option.padEnd(14)} ${columns.join('  ')}`);
}

await browser.close();
server.close();

failures.push(...consoleErrors.map((error) => `console error: ${error}`));
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((f) => `- ${f}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `\nOK — every clip audible, and ${options.length} options × ${presets.length} gestures ` +
      `made sound on both the drag and the release (columns are drag peak→release peak).`
  );
}
