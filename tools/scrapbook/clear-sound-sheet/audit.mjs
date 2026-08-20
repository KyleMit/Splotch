#!/usr/bin/env node
// Drives the generated contact sheet through every option × every scripted
// gesture in a real browser and fails if any of them renders silence.
//
// The rig is all Web Audio, so a broken graph (a node left disconnected, a clip
// that decoded to nothing, a ready pulse whose timer never starts) produces a
// page that looks perfect and makes no sound. Headless Chromium runs the audio
// clock for real, so an AnalyserNode on the master bus is enough to catch it.
//
// Set CHROMIUM_PATH when Playwright's own browser download is unavailable.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHEET_DIR = resolve(HERE, '../../../scrapbook/sound-design/clear-sound-contact-sheet');
const PORT = Number(process.env.SPLOTCH_SOUND_AUDIT_PORT ?? 4185);
const SILENCE_PEAK = 0.02;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mp3': 'audio/mpeg' };

const server = createServer(async (request, response) => {
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
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (message.location()?.url?.endsWith('/favicon.ico')) return;
  consoleErrors.push(message.text());
});
page.on('requestfailed', (request) => consoleErrors.push(`request failed: ${request.url()}`));
// The browser asks for /favicon.ico on its own; a miss there says nothing about
// the page, and the scrapbook chrome does not emit one.
page.on('response', (response) => {
  if (!response.ok() && !response.url().endsWith('/favicon.ico')) {
    consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
  }
});

await page.goto(`http://127.0.0.1:${PORT}/index.html`);
await page.click('[data-enable]');
await page.waitForFunction(() => document.body.classList.contains('audio-ready'));

const clipPeaks = await page.evaluate(() => window.__sheetClips());
const deadClips = Object.entries(clipPeaks).filter(([, peak]) => !peak || peak < SILENCE_PEAK);

const options = await page.evaluate(() => window.__sheetOptions);
const presets = await page.evaluate(() => window.__sheetPresets);
const silent = [];
for (const option of options) {
  const peaks = [];
  for (const preset of presets) {
    const { peak, loudness } = await page.evaluate(
      ([o, p]) => window.__sheetAudit(o, p),
      [option, preset]
    );
    peaks.push(`${preset} ${peak.toFixed(2)}/${loudness.toFixed(3)}`);
    if (peak < SILENCE_PEAK) silent.push(`${option} / ${preset} (peak ${peak.toFixed(4)})`);
  }
  console.log(`${option.padEnd(14)} ${peaks.join('  ')}`);
}

await browser.close();
server.close();

const failures = [
  ...deadClips.map(([name, peak]) => `clip ${name} is silent or missing (peak ${peak})`),
  ...silent.map((entry) => `no audible output for ${entry}`),
  ...consoleErrors.map((error) => `console error: ${error}`),
];
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((f) => `- ${f}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `\nOK — ${options.length} options × ${presets.length} gestures all audible ` +
      `(columns are peak/loudness).`
  );
}
