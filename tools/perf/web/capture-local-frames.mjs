// The real-screen probe without an iPad: same probe, same maths, driven against
// `/` in a local browser so a frame-pacing baseline costs a command instead of a
// USB cable.
//
//   npm run perf:web:frames                      Playwright WebKit (the iOS engine family)
//   npm run perf:web:frames -- --engine=chromium --throttle=4
//   npm run perf:web:frames -- --drive-hz=120 --phases=page,page-no-halos
//   npm run perf:web:frames -- --viewport=2049x1373 --device-scale-factor=2
//
// WHAT THIS CAN AND CANNOT STAND IN FOR. The device findings this exists to
// reproduce are compositor-side: frame production blocked at a stroke boundary,
// and a `mix-blend-mode` plate that falls behind. Neither is a property of JS, so
// neither is guaranteed to survive a different compositor:
//
//   * `--engine=webkit` is the right engine FAMILY (WebKit/JavaScriptCore, the
//     one the iOS app ships) but a desktop build on desktop silicon, compositing
//     to a Mac window rather than through iOS's render server. Closest available.
//   * `--engine=chromium` is a different compositor entirely, and headless
//     Chromium renders through SwiftShader — full-canvas work is exaggerated and
//     GPU-side behaviour is not modelled at all. Useful for the CPU-throttle
//     dimension (`--throttle=N`, CDP-only) and for catching a JS-side regression,
//     not for judging compositing.
//
// So: a stall that reproduces here is a cheap regression signal worth keeping. A
// stall that does NOT reproduce here says nothing about the device — check
// `npm run perf:ios:webkit:frames` before concluding anything is fixed.

import { chromium, webkit } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { waitForUrl } from '../../lib/net.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { warnIfNoPerfMarks } from '../lib/profile-warnings.mjs';
import { spawnPerfServe } from '../serve-profile-build.mjs';
import { printRun } from '../analyze-frame-capture.mjs';
import { probeConfigScript } from '../ios/capture-webkit-frames.mjs';
import {
  ensureCampaignTheme,
  parseCampaignTheme,
  readResolvedTheme,
} from '../lib/campaign-state.mjs';

const PROBE_FILE = join(ROOT, 'tools', 'perf', 'probes', 'real-screen-probe.js');
const APP_URL_PATH = '/';

// The iPad Pro 12.9" the device runs measure, so geometry-dependent costs (a
// 4.7 Mpx canvas backing store, a full-paper blend) are the same size here.
const IPAD_PRO_VIEWPORT = { width: 1366, height: 915 };
const IPAD_PRO_SCALE = 2;

const DEFAULT_CONTACT_SECONDS = 10;
const RUN_TIMEOUT_MS = 20 * 60_000;
const PROGRESS_POLL_MS = 1_000;
const READY_TIMEOUT_MS = 60_000;
const SERVER_READY_TIMEOUT_MS = 90_000;

const ENGINES = {
  webkit: { launcher: webkit, hasCdp: false },
  chromium: { launcher: chromium, hasCdp: true },
};

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${label} must be a positive number`);
  return number;
}

function resolveViewport(value) {
  if (!value) return IPAD_PRO_VIEWPORT;
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) fail(`--viewport=${value} must use WIDTHxHEIGHT, for example 1366x915`);
  return {
    width: positiveNumber(match[1], 'viewport width'),
    height: positiveNumber(match[2], 'viewport height'),
  };
}

export async function runFramesLocal(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    {
      entry: true,
      throttleDefault: 1,
      extra: [
        'engine',
        'url',
        'brush',
        'phases',
        'contact-seconds',
        'drive',
        'drive-hz',
        'viewport',
        'device-scale-factor',
        'headed',
        'no-serve',
        'no-forensics',
        'output',
        'theme',
      ],
    },
    argv
  );
  warnIfNoPerfMarks('npm run perf:web:frames');

  const engineName = flag('engine', 'webkit');
  const engine = ENGINES[engineName];
  if (!engine) {
    fail(
      `--engine=${engineName} is not known — expected one of ${Object.keys(ENGINES).join(', ')}`
    );
  }
  const { throttle } = parsePerfArgs({ throttleDefault: 1 }, argv);
  if (throttle.active && !engine.hasCdp) {
    fail(`--throttle needs CDP, which ${engineName} has none of. Use --engine=chromium.`);
  }

  const externalUrl = flag('url');
  const url = externalUrl
    ? new URL(externalUrl).toString()
    : `http://localhost:${port}${APP_URL_PATH}`;
  const contactSeconds = Number(flag('contact-seconds', DEFAULT_CONTACT_SECONDS));
  const drive = flag('drive', 'mixed');
  const brush = flag('brush', 'pen');
  const driveHz = flag('drive-hz') && Number(flag('drive-hz'));
  const viewport = resolveViewport(flag('viewport'));
  const deviceScaleFactor = positiveNumber(
    flag('device-scale-factor', IPAD_PRO_SCALE),
    'device scale factor'
  );
  const headless = !has('headed');
  const requestedTheme = parseCampaignTheme(flag('theme'));
  const probeConfig = probeConfigScript({
    phases: flag('phases'),
    contactMs: contactSeconds * 1000,
    drive,
    driveHz: driveHz || undefined,
    brush,
    hud: false,
  });
  const server = externalUrl || has('no-serve') ? null : spawnPerfServe(port);

  let browser;
  try {
    await waitForUrl(url, SERVER_READY_TIMEOUT_MS);
    browser = await engine.launcher.launch({ headless });
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor,
    });
    const page = await context.newPage();
    const pageLogs = [];
    page.on('console', (message) => pageLogs.push({ level: message.type(), text: message.text() }));
    page.on('pageerror', (error) => pageLogs.push({ level: 'error', text: error.message }));

    if (throttle.active) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.forSettings });
    }

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('#drawingCanvas');
        return !!canvas && canvas.width > 0;
      },
      undefined,
      { timeout: READY_TIMEOUT_MS }
    );
    const execute = (script) => page.evaluate(`(() => {${script}})()`);
    await ensureCampaignTheme(execute, requestedTheme);
    const theme = await readResolvedTheme(execute);
    await page.evaluate(probeConfig);
    await page.evaluate(readFileSync(PROBE_FILE, 'utf8'));
    if (!(await page.evaluate(() => !!window.__probe))) {
      fail(
        `The probe did not install: ${pageLogs.map((entry) => entry.text).join(' | ') || 'no reason logged'}`
      );
    }
    console.log(
      `${engineName} · ${throttle.tag} CPU · ${viewport.width}×${viewport.height}@${deviceScaleFactor}x · ` +
        `${brush} · driving ${drive}${driveHz ? ` at ${driveHz} Hz` : ' at one move per frame'}`
    );

    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let announced = '';
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => window.__probe?.state());
      if (state?.progress && state.progress !== announced) {
        console.log(`  … ${(announced = state.progress)}`);
      }
      if (state?.done) break;
      await sleep(PROGRESS_POLL_MS);
    }

    const report = await page.evaluate(() => window.__probe.finish());
    const counts = await page.evaluate(() => window.__probe.counts());
    report.frames = await page.evaluate((n) => window.__probe.frames(0, n), counts.frames);
    report.events = await page.evaluate((n) => window.__probe.events(0, n), counts.events);
    report.measures = await page.evaluate((n) => window.__probe.measures(0, n), counts.measures);
    await page.evaluate(() => window.__probe.stop());

    const capture = {
      device: { name: `${engineName} (local)`, os: process.platform },
      appUrl: url,
      mode: `synthetic:${drive}${driveHz ? `@${driveHz}hz` : ''}:${brush}`,
      brush,
      engine: engineName,
      throttle: throttle.tag,
      viewport: { ...viewport, deviceScaleFactor },
      headless,
      theme,
      report,
      console: pageLogs,
    };
    const summaries = printRun(capture, { forensics: !has('no-forensics') });
    capture.summaries = summaries;

    const artifact =
      flag('output') ??
      join(profilePath('frames-local', engineName, throttle.tag, brush), 'real-screen.json');
    mkdirSync(dirname(artifact), { recursive: true });
    writeFileSync(artifact, `${JSON.stringify(capture, null, 2)}\n`);
    console.log(`\nWrote ${artifact}`);
    return { summaries, report };
  } finally {
    await browser?.close();
    server?.stop();
  }
}

if (isMain(import.meta.url)) runMain(runFramesLocal);
