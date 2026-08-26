// The report channel that works from a BUNDLED build (issue 1323, Android
// half): the app loads its own assets — no probe host, no server.url — and the
// report leaves the device over the WebView's DevTools socket instead of a
// network the page is not allowed to reach (a plain-http LAN host is mixed
// content from the bundled origin, which is what forced remote delivery
// everywhere else). An idle CDP debugger is not part of the input path, so
// unlike an Appium/WDA session it is not an input-fidelity variable — which is
// the property the bundled hand capture needs.
//
//   npm run perf:android:bundled:frames -- --device-serial=<serial> --brush=pen
//   npm run perf:android:bundled:frames -- --device-serial=<serial> --input=hand --seconds=20
//
// The installed app must be a debug build (the DevTools socket is
// debug-only) — a PERF_MARKS build if the engine columns should populate.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { ROOT, argFlag, fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { pollFor } from '../split-capture/lib/poll.mjs';
import {
  androidGestureInstructions,
  androidNativeLaunchSteps,
  androidRotationRestoreCommands,
  swipeArgs,
} from '../split-capture/lib/android-input.mjs';
import { runtimeUaProblem } from '../split-capture/capture-hand-input.mjs';
import { BRUSH_BUTTON_BY_MODE, trustedGestureActions } from '../ios/capture-xcuitest-screen.mjs';
import { probeConfigScript } from '../ios/capture-webkit-frames.mjs';
import { captureRuntime, describeFidelityFailures, inputFidelity } from '../lib/input-fidelity.mjs';
import { summarizeRun } from '../lib/real-screen-stats.mjs';
import { LOST_FRAME_TIME_SHARE_GATE, scoreDrawingRun } from '../lib/drawing-gates.mjs';
import { hostQuietRecord, sampleHostLoad } from '../lib/host-quiet.mjs';
import { ensureCampaignTheme, readResolvedTheme } from '../lib/campaign-state.mjs';
import { GESTURE_REPEATS, gesturePlanFor } from '../lib/campaign-plan.mjs';

const PROBE_FILE = join(ROOT, 'tools', 'perf', 'probes', 'real-screen-probe.js');
const PROBE_CONTACT_BUDGET_MS = 60_000;
const DEFAULT_CDP_FORWARD_PORT = 9226;
const PAGE_READY_TIMEOUT_MS = 60_000;
const SOCKET_TIMEOUT_MS = 25_000;
const SETTLE_MS = { appStop: 1_500, rotation: 2_500, page: 6_000 };
const AFTER_GESTURE_SETTLE_MS = 500;
const TABLE_CHUNK_ROWS = 2_000;
const HAND_DEFAULT_SECONDS = 20;
const HAND_COUNTDOWN_SECONDS = 5;

// The identity the channel exists to prove: the attached target's URL comes
// from the DEBUGGER, not from anything the page reports, and a bundled
// Capacitor page lives on its build-time origin. Anything else — a probe-host
// page, a restored Chrome tab — is not a bundled capture and must refuse.
const BUNDLED_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];
export function bundledPageProblem(url) {
  if (BUNDLED_ORIGINS.some((origin) => url === origin || url.startsWith(`${origin}/`))) {
    return null;
  }
  return `attached page is ${url}, not a bundled Capacitor origin (${BUNDLED_ORIGINS.join(', ')})`;
}

function exec(serial, args) {
  const result = spawnSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`adb ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

// The WebView exposes DevTools over an abstract unix socket named
// webview_devtools_remote_<pid>. Serial-aware (unlike the session tool's
// reader, which shells bare adb and cannot pick between two attached
// devices — the campaign rig always has both).
function readAppWebviewSocket(serial) {
  const pid = exec(serial, ['shell', 'pidof', 'art.splotch.app']).split(/\s+/)[0];
  if (!pid) return null;
  const unix = exec(serial, ['shell', 'cat', '/proc/net/unix']);
  const named = `webview_devtools_remote_${pid}`;
  if (unix.includes(named)) return named;
  const any = unix.match(/webview_devtools_remote_\d+/);
  return any ? any[0] : null;
}

async function attachToBundledPage(serial, forwardPort) {
  const socket = await pollFor(async () => readAppWebviewSocket(serial), SOCKET_TIMEOUT_MS);
  if (!socket) fail('the app exposed no WebView DevTools socket — is a debug build installed?');
  exec(serial, ['forward', `tcp:${forwardPort}`, `localabstract:${socket}`]);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${forwardPort}`);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => !bundledPageProblem(candidate.url()));
  if (!page) {
    const seen = pages.map((candidate) => candidate.url()).join(', ') || 'none';
    await browser.close();
    fail(`no bundled Capacitor page over CDP (targets: ${seen})`);
  }
  return { browser, page };
}

export async function captureBundledFrames({
  serial = argFlag('device-serial'),
  brush = argFlag('brush', 'pen'),
  repeats = Number(argFlag('gesture-repeats', GESTURE_REPEATS)),
  orientation = argFlag('orientation', 'PORTRAIT'),
  requestedTheme = argFlag('theme', 'light'),
  input = argFlag('input', 'adb'),
  seconds = Number(argFlag('seconds', HAND_DEFAULT_SECONDS)),
  forwardPort = Number(argFlag('cdp-forward-port', DEFAULT_CDP_FORWARD_PORT)),
  label = argFlag('label'),
  output = argFlag('output'),
} = {}) {
  if (!serial) fail('--device-serial= is required');
  if (!['adb', 'hand'].includes(input)) fail('--input must be adb or hand');
  const runLabel = label ?? `bundled-android-${brush}-${orientation.toLowerCase()}-${requestedTheme}`;
  const hostLoadStart = sampleHostLoad();

  // The rotation state to put back is whatever was there BEFORE this run
  // wrote its own — read first, restore in the finally.
  const previousRotation = Object.fromEntries(
    ['accelerometer_rotation', 'user_rotation'].map((key) => [
      key,
      exec(serial, ['shell', 'settings', 'get', 'system', key]),
    ])
  );
  for (const step of androidNativeLaunchSteps(orientation)) {
    exec(serial, step.args);
    if (step.settle) await sleep(SETTLE_MS[step.settle]);
  }
  const { browser, page } = await attachToBundledPage(serial, forwardPort);
  try {
    const pageUrl = page.url();
    const identityProblem = bundledPageProblem(pageUrl);
    if (identityProblem) fail(identityProblem);

    await page.waitForFunction(
      () => document.querySelector('#drawingCanvas')?.getBoundingClientRect().width > 0,
      undefined,
      { timeout: PAGE_READY_TIMEOUT_MS }
    );
    const ua = await page.evaluate(() => navigator.userAgent);
    const uaProblem = runtimeUaProblem('android-capacitor-webview', ua);
    if (uaProblem) fail(uaProblem);

    const execute = (script) => page.evaluate(`(() => {${script}})()`);
    await ensureCampaignTheme(execute, requestedTheme);
    const observedTheme = await readResolvedTheme(execute);
    await execute(
      `document.querySelector(${JSON.stringify(BRUSH_BUTTON_BY_MODE[brush] ?? '#penBrushButton')})?.click(); return true;`
    );
    const committed = await pollFor(
      async () => page.evaluate(() => window.__committedBrushMode?.()),
      10_000,
      { intervalMs: 250 }
    );
    if (brush !== 'eraser' && committed !== brush) {
      fail(`the page committed ${committed ?? 'nothing'}, not ${brush}`);
    }

    await page.evaluate(
      probeConfigScript({ phases: 'blank', contactMs: PROBE_CONTACT_BUDGET_MS, hud: false })
    );
    const installed = await page.evaluate(
      `${readFileSync(PROBE_FILE, 'utf8')}\n!!window.__probe`
    );
    if (!installed) fail('the probe did not install in the bundled page');

    if (input === 'adb') {
      const geometry = await page.evaluate(() => {
        const rect = document.querySelector('#drawingCanvas').getBoundingClientRect();
        return {
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          dpr: window.devicePixelRatio,
        };
      });
      console.log(`canvas ${JSON.stringify(geometry.bounds)} scale ${geometry.dpr}`);
      const instructions = androidGestureInstructions(
        trustedGestureActions(geometry.bounds, repeats, 0),
        { densityScale: geometry.dpr }
      );
      for (const instruction of instructions) {
        if (instruction.kind === 'pause') await sleep(instruction.durationMs);
        else exec(serial, swipeArgs(instruction));
      }
    } else {
      console.log(`\nDraw ${brush} strokes on the device for ~${seconds}s.`);
      for (let tick = HAND_COUNTDOWN_SECONDS; tick > 0; tick -= 1) {
        console.log(`  starting in ${tick}…`);
        await sleep(1_000);
      }
      console.log('  GO — drawing window open');
      await sleep(seconds * 1_000);
      console.log('  window closed');
    }
    await sleep(AFTER_GESTURE_SETTLE_MS);

    const report = await page.evaluate(() => window.__probe.finish());
    const counts = await page.evaluate(() => window.__probe.counts());
    for (const accessor of ['frames', 'events', 'measures']) {
      const rows = [];
      while (rows.length < counts[accessor]) {
        rows.push(
          ...(await page.evaluate(
            `window.__probe.${accessor}(${rows.length}, ${TABLE_CHUNK_ROWS})`
          ))
        );
      }
      report[accessor] = rows;
    }

    const summaries = summarizeRun(report);
    const runtime = captureRuntime('android', true);
    const fidelity = inputFidelity(summaries.phases?.[0]?.input ?? {}, runtime);
    const drawing = scoreDrawingRun(summaries.phases, LOST_FRAME_TIME_SHARE_GATE);
    const artifact = {
      label: runLabel,
      platform: 'android',
      brush,
      orientation,
      theme: requestedTheme,
      observedTheme,
      gestureRepeats: input === 'adb' ? repeats : null,
      gesturePlan: input === 'adb' ? gesturePlanFor(brush) : null,
      handCapture: input === 'hand',
      ...(input === 'hand' ? { runtime, reading: null, drawSeconds: seconds } : {}),
      nativeApp: true,
      // The whole point of this tool (issue 1323): the page is the app's own
      // bundled assets, and the identity is the DEBUGGER's answer for the
      // attached target, not a field the page could fake.
      pageDelivery: 'bundled',
      pageIdentity: 'proven-by-attached-target',
      pageUrl,
      userAgent: ua,
      transport: 'cdp-bundled',
      hostQuiet: hostQuietRecord(hostLoadStart, sampleHostLoad()),
      fidelity,
      drawing,
      summaries,
      report,
    };
    const out = output ?? join('perf-profiles', 'bundled', `${runLabel}-real-screen.json`);
    mkdirSync(join(ROOT, dirname(out)), { recursive: true });
    writeFileSync(join(ROOT, out), JSON.stringify(artifact, null, 2));

    console.log(
      `\nFidelity: ${fidelity.passed ? 'PASS' : 'FAIL'} (${fidelity.runtime}) · ` +
        JSON.stringify(fidelity.checks)
    );
    if (!fidelity.passed) console.log(`  not passing: ${describeFidelityFailures(fidelity)}`);
    for (const phase of drawing.phases) {
      console.log(
        `  ${phase.phase}: lost ${(phase.lostFrameTimeShare * 100).toFixed(2)}% · ` +
          `paint max ${phase.paint.max}ms · ${phase.passed ? 'PASS' : 'FAIL'}`
      );
    }
    console.log(`Wrote ${out}`);
    return artifact;
  } finally {
    await browser.close().catch((error) => console.warn(`CDP close failed: ${error.message}`));
    for (const command of androidRotationRestoreCommands(previousRotation)) exec(serial, command);
  }
}

if (isMain(import.meta.url)) runMain(captureBundledFrames);
