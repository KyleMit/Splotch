#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openDrawingScreen } from '../../../e2e/support/drawing.ts';
import { chromiumExecutablePath } from '../../../tools/lib/playwright.mjs';
import { parseNumberFlag, TCP_PORT } from '../../../tools/lib/proc.mjs';
import {
  RELEASABLE_STDIO,
  portListenerPids,
  spawnSiteServer,
} from '../../../tools/lib/site-server.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const SERVER_READY_TIMEOUT_MS = 60_000;
const SERVER_POLL_INTERVAL_MS = 300;
const VIEWPORT = { width: 1280, height: 800 };

const { values } = parseArgs({
  options: {
    route: { type: 'string', default: '/' },
    out: { type: 'string', default: 'screenshots/splotch.png' },
    draw: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    port: { type: 'string', default: '5199' },
    url: { type: 'string' },
  },
});

const port = parseNumberFlag('port', values.port, TCP_PORT);
const out = resolve(REPO_ROOT, values.out);
let ownedSite;

async function waitForServer(baseURL) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  for (;;) {
    if (ownedSite.server.exitCode !== null || ownedSite.server.signalCode !== null) {
      throw new Error(`Site host could not start on ${baseURL}; choose another unused --port.`);
    }
    let response;
    try {
      response = await fetch(baseURL, { method: 'HEAD' });
    } catch {}
    if (response?.ok) {
      const listeners = portListenerPids(port);
      if (!listeners.includes(ownedSite.server.pid)) {
        throw new Error(
          `Port ${port} answered from another process; choose another unused --port.`
        );
      }
      return;
    }
    if (Date.now() > deadline) throw new Error(`Site host never became ready at ${baseURL}`);
    await new Promise((resolve) => setTimeout(resolve, SERVER_POLL_INTERVAL_MS));
  }
}

async function captureRoute(baseURL) {
  const browser = await chromium.launch({
    headless: !values.headed,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, baseURL });
    if (values.route === '/') {
      const screen = await openDrawingScreen(page);
      if (values.draw) {
        await screen.pickColor('Black');
        const stroke = await screen.drawStroke();
        const inked = await screen.inkedPixels(stroke);
        if (inked === 0) throw new Error('The stroke left no visible ink on the drawing paper');
        console.log(`stroke inked pixels: ${inked}`);
      }
    } else {
      const response = await page.goto(new URL(values.route, baseURL).href);
      if (!response?.ok())
        throw new Error(`${values.route} answered ${response?.status() ?? 'no response'}`);
      await page.locator('body').waitFor({ state: 'visible' });
    }
    await page.evaluate(() => document.fonts.ready);
    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
  } finally {
    await browser.close();
  }
}

async function main() {
  const baseURL = values.url ?? `http://127.0.0.1:${port}`;
  if (!values.url) {
    if (portListenerPids(port).length) {
      throw new Error(`Port ${port} is already in use; choose another unused --port.`);
    }
    ownedSite = spawnSiteServer(port, values.keep ? RELEASABLE_STDIO : { stdout: 'pipe' });
    ownedSite.server.stdout?.on('data', (chunk) => process.stderr.write(chunk));
    await waitForServer(baseURL);
  }
  await captureRoute(baseURL);
  console.log(`screenshot: ${out}`);
  console.log(`route ready: ${new URL(values.route, baseURL).href}`);

  if (ownedSite && values.keep) {
    ownedSite.release();
    console.log(
      `server left running: ${baseURL} (process group ${ownedSite.server.pid}) — stop with: kill -- -${ownedSite.server.pid}`
    );
  } else {
    ownedSite?.stop();
  }
}

main().catch((error) => {
  console.error('driver failed:', error.message);
  ownedSite?.stop();
  process.exitCode = 1;
});
