// The report channel that works from a BUNDLED build (issue 1323, Android
// half): the app loads its own assets — no probe host, no server.url — and the
// report leaves the device over the WebView's DevTools socket instead of a
// network the page is not allowed to reach (a plain-http LAN host is mixed
// content from the bundled origin, which is what forced remote delivery
// everywhere else). An idle CDP debugger is not part of the input path, so
// unlike an Appium/WDA session it does not put the device into automation
// mode. That an idle attached debugger does not otherwise perturb timing is
// an UNVERIFIED ASSUMPTION, not a measured property (the PR 1385 review):
// DevTools attachment can alter WebView/V8 scheduling even with no input
// injected. Before hand captures through this channel are leaned on for
// calibration, run a paired attached-vs-unattached control with a
// device-local frame clock.
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
import { ROOT, argFlag, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { pollFor } from '../split-capture/lib/poll.mjs';
import {
  androidGestureInstructions,
  androidNativeLaunchSteps,
  androidRotationCommands,
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
import {
  PLATFORM_OWNS_ROTATION,
  ensureCampaignTheme,
  parseCampaignOrientation,
  readResolvedTheme,
  releaseNativeRotationLock,
  restoreNativeRotationLock,
} from '../lib/campaign-state.mjs';
import { GESTURE_REPEATS, gesturePlanFor } from '../lib/campaign-plan.mjs';

const PROBE_FILE = join(ROOT, 'tools', 'perf', 'probes', 'real-screen-probe.js');
const PROBE_CONTACT_BUDGET_MS = 60_000;
const DEFAULT_CDP_FORWARD_PORT = 9226;
const PAGE_READY_TIMEOUT_MS = 60_000;
const BRUSH_COMMIT_TIMEOUT_MS = 10_000;
const BRUSH_OPTION_MOUNT_TIMEOUT_MS = 10_000;
const BRUSH_OPTION_POLL_MS = 100;
const SOCKET_TIMEOUT_MS = 25_000;
const SETTLE_MS = { appStop: 1_500, rotation: 2_500, page: 6_000 };
const AFTER_GESTURE_SETTLE_MS = 500;
const TABLE_CHUNK_ROWS = 2_000;
const HAND_DEFAULT_SECONDS = 20;
const HAND_COUNTDOWN_SECONDS = 5;
// How long the Activity may take to follow `user_rotation` once the app's own
// rotation lock is released; a rotation lands in well under a second on the rig
// phone, so this only bounds a device that is not going to turn.
const ROTATION_FOLLOW_TIMEOUT_MS = 10_000;
const ROTATION_FOLLOW_POLL_MS = 250;

// The identity the channel exists to prove: the attached target's URL comes
// from the DEBUGGER, not from anything the page reports, and a bundled
// Capacitor page lives on the ONE origin the build config fixes — derived
// from capacitor.config.json's androidScheme rather than restated (the PR
// 1385 review: a permissive list accepted http://localhost, which is not
// this app's build-time origin and can name locally served content — exactly
// the delivery this guard exists to refuse). Anything else — a probe-host
// page, a dev server, a restored tab — is not a bundled capture.
const CAPACITOR_CONFIG = JSON.parse(
  readFileSync(join(ROOT, 'capacitor.config.json'), 'utf8')
);
const BUNDLED_ORIGIN = `${CAPACITOR_CONFIG.server?.androidScheme ?? 'https'}://localhost`;
export function bundledPageProblem(url, origin = BUNDLED_ORIGIN) {
  if (url === origin || url.startsWith(`${origin}/`)) return null;
  return `attached page is ${url}, not the bundled Capacitor origin (${origin})`;
}

// Throws rather than calling fail(): fail() exits the process on the spot,
// which skips the cleanup that puts the device's rotation and the app's
// rotation lock back.
function exec(serial, args) {
  const result = spawnSync('adb', ['-s', serial, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`adb ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
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
  if (!socket) {
    throw new Error('the app exposed no WebView DevTools socket — is a debug build installed?');
  }
  exec(serial, ['forward', `tcp:${forwardPort}`, `localabstract:${socket}`]);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${forwardPort}`);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => !bundledPageProblem(candidate.url()));
  if (!page) {
    const seen = pages.map((candidate) => candidate.url()).join(', ') || 'none';
    await browser.close();
    throw new Error(`no bundled Capacitor page over CDP (targets: ${seen})`);
  }
  return { browser, page };
}

// Everything the orientation verdict and the artifact need, read by the PAGE in
// one evaluation. The requested orientation and a successful `adb settings put`
// prove nothing on their own: the app's rotation lock (on by default) holds the
// Activity at its own orientation through any `user_rotation`, and a LANDSCAPE
// cell measured at 360x780 portrait passed every other check (issue 2065's
// device validation).
export const PAGE_GEOMETRY_SCRIPT = `(() => {
  const rect = document.querySelector('#drawingCanvas')?.getBoundingClientRect();
  return {
    viewport: { width: innerWidth, height: innerHeight },
    canvas: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    dpr: devicePixelRatio,
    screenOrientation: screen.orientation?.type ?? null,
  };
})()`;

// A rotation mid-capture can leave the endpoints matching, so the page records
// every layout change between the pre-contact snapshot and the readback.
const GEOMETRY_WATCH_SCRIPT = `(() => {
  const changes = [];
  const note = (kind) =>
    changes.push({ kind, at: performance.now(), width: innerWidth, height: innerHeight });
  addEventListener('resize', () => note('resize'));
  screen.orientation?.addEventListener('change', () => note('orientation'));
  window.__bundledGeometryChanges = changes;
  return true;
})()`;

const isPositive = (value) => Number.isFinite(value) && value > 0;

export function observedOrientation(geometry) {
  const { width, height } = geometry?.viewport ?? {};
  if (!isPositive(width) || !isPositive(height) || width === height) return null;
  return width > height ? 'LANDSCAPE' : 'PORTRAIT';
}

export function orientationProblem(requested, geometry) {
  const observed = observedOrientation(geometry);
  if (!observed) {
    return `the page reported no usable viewport (${JSON.stringify(geometry?.viewport ?? null)}), so it cannot prove its orientation`;
  }
  const canvas = geometry.canvas;
  if (!canvas || !isPositive(canvas.width) || !isPositive(canvas.height)) {
    return 'the page reported no sized #drawingCanvas';
  }
  if (observed !== requested) {
    const { width, height } = geometry.viewport;
    return `the page is ${observed} at ${width}x${height}, not the requested ${requested}`;
  }
  return null;
}

export function geometryDriftProblem(before, after) {
  const pairs = [
    ['viewport width', before?.viewport?.width, after?.viewport?.width],
    ['viewport height', before?.viewport?.height, after?.viewport?.height],
    ['canvas x', before?.canvas?.x, after?.canvas?.x],
    ['canvas y', before?.canvas?.y, after?.canvas?.y],
    ['canvas width', before?.canvas?.width, after?.canvas?.width],
    ['canvas height', before?.canvas?.height, after?.canvas?.height],
    ['devicePixelRatio', before?.dpr, after?.dpr],
  ];
  const changed = pairs.filter(([, from, to]) => !Number.isFinite(from) || from !== to);
  if (!changed.length) return null;
  return `the page geometry changed during the capture (${changed
    .map(([name, from, to]) => `${name} ${from} -> ${to}`)
    .join(', ')})`;
}

export function geometryChangesProblem(changes) {
  if (!Array.isArray(changes)) return 'the page lost its geometry-change record';
  if (!changes.length) return null;
  return `the page resized or rotated ${changes.length} time(s) during the capture: ${JSON.stringify(changes)}`;
}

// Brings the page to the requested orientation the way the Appium actions
// runner does for the iPad: the capture has already asserted `user_rotation`,
// and when the page did not follow, the app's own rotation lock is released
// through Settings (the product path, not a preference write) so the Activity
// can. The lock is released only when it is in the way; the caller captures
// the prior lock state before anything changes so cleanup can restore it
// exactly. What the page reports afterwards is the only acceptance.
//
// Releasing the lock does not by itself turn the display. Measured on the rig
// phone (SM-G990U1, Android 16): with `user_rotation=1` asserted, the unlocked
// Activity stayed at ROTATION_0 for 3 s, and turned only once `user_rotation`
// was written again — the same value is enough. Hence `reassertRotation`.
export async function establishRequestedOrientation({
  orientation,
  readGeometry,
  releaseLock,
  reassertRotation,
  wait = sleep,
  followTimeoutMs = ROTATION_FOLLOW_TIMEOUT_MS,
  pollMs = ROTATION_FOLLOW_POLL_MS,
  settleMs = SETTLE_MS.rotation,
}) {
  const launched = await readGeometry();
  if (!orientationProblem(orientation, launched)) {
    return { launched, settled: launched, lockReleased: false };
  }
  const initialLock = await releaseLock();
  await reassertRotation();
  const deadline = Date.now() + followTimeoutMs;
  while (
    observedOrientation(await readGeometry()) !== orientation &&
    Date.now() < deadline
  ) {
    await wait(pollMs);
  }
  await wait(settleMs);
  const settled = await readGeometry();
  const problem = orientationProblem(orientation, settled);
  if (problem) {
    const lock =
      initialLock === PLATFORM_OWNS_ROTATION
        ? 'the platform owns rotation, so there was no app lock to release'
        : `after releasing the app's rotation lock (${JSON.stringify(initialLock)})`;
    throw new Error(`${problem} — ${lock}`);
  }
  return { launched, settled, lockReleased: Boolean(initialLock?.lockedOrientation) };
}

// The Brush Menu mounts its options only while it is open, and a pick closes it
// again; with a single optional brush there is no menu, and the trigger (no
// aria-expanded) toggles that brush against the pen, so clicking it when the
// brush is already held would switch away. Mirrors the real-screen probe's
// selectBrush, which this page-evaluated path cannot import. The caller proves
// the pick by the committed mode, not by the click.
export function brushPickScript(brush) {
  const option = JSON.stringify(BRUSH_BUTTON_BY_MODE[brush]);
  if (option === undefined) throw new Error(`--brush must be one of ${Object.keys(BRUSH_BUTTON_BY_MODE).join(', ')}`);
  return `(async () => {
    if (window.__committedBrushMode?.() === ${JSON.stringify(brush)}) return 'held';
    const trigger = document.querySelector('#brushButton');
    if (document.querySelector(${option})) {
      document.querySelector(${option}).click();
      return 'option';
    }
    if (trigger?.hasAttribute('aria-expanded')) {
      trigger.click();
      const deadline = performance.now() + ${BRUSH_OPTION_MOUNT_TIMEOUT_MS};
      while (!document.querySelector(${option}) && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, ${BRUSH_OPTION_POLL_MS}));
      }
      document.querySelector(${option})?.click();
      return 'menu';
    }
    trigger?.click();
    return trigger ? 'toggle' : 'no-trigger';
  })()`;
}

export async function captureBundledFrames({
  serial = argFlag('device-serial'),
  brush = argFlag('brush', 'pen'),
  repeats = Number(argFlag('gesture-repeats', GESTURE_REPEATS)),
  orientation = parseCampaignOrientation(argFlag('orientation')) ?? 'PORTRAIT',
  requestedTheme = argFlag('theme', 'light'),
  input = argFlag('input', 'adb'),
  seconds = Number(argFlag('seconds', HAND_DEFAULT_SECONDS)),
  forwardPort = Number(argFlag('cdp-forward-port', DEFAULT_CDP_FORWARD_PORT)),
  label = argFlag('label'),
  output = argFlag('output'),
} = {}) {
  if (!serial) throw new Error('--device-serial= is required');
  if (!['adb', 'hand'].includes(input)) throw new Error('--input must be adb or hand');
  const runLabel = label ?? `bundled-android-${brush}-${orientation.toLowerCase()}-${requestedTheme}`;
  const hostLoadStart = sampleHostLoad();

  // The rotation state to put back is whatever was there BEFORE this run
  // wrote its own — read first, restore in cleanup: a socket timeout, a CDP
  // connect failure, or a not-bundled refusal after the rotation write must
  // still restore it, and each cleanup step runs independently so one failure
  // cannot strand the others (the PR 1385 review — a stale forward or locked
  // rotation contaminates the shared rig's next capture). The app's own
  // rotation lock is restored first, while the page is still attached.
  const previousRotation = Object.fromEntries(
    ['accelerometer_rotation', 'user_rotation'].map((key) => [
      key,
      exec(serial, ['shell', 'settings', 'get', 'system', key]),
    ])
  );
  const state = { browser: null, execute: null, forwarded: false, lockToRestore: null };
  let cleanupPromise = null;
  const cleanup = () => {
    cleanupPromise ??= restoreCaptureState({ serial, forwardPort, previousRotation, state });
    return cleanupPromise;
  };
  const onSignal = (exitCode) => {
    void cleanup().finally(() => process.exit(exitCode));
  };
  const onSigint = () => onSignal(130);
  const onSigterm = () => onSignal(143);
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  let artifact;
  try {
    artifact = await measure();
  } finally {
    const restored = await cleanup();
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    if (artifact) artifact.cleanup = restored;
  }
  const failedCleanup = artifact.cleanup.filter((step) => !step.ok);
  if (failedCleanup.length) {
    console.warn(
      `cleanup did not complete: ${JSON.stringify(failedCleanup)} — the rig may measure the next cell in the wrong state`
    );
    process.exitCode = 1;
  }
  const out = output ?? join('perf-profiles', 'bundled', `${runLabel}-real-screen.json`);
  mkdirSync(join(ROOT, dirname(out)), { recursive: true });
  writeFileSync(join(ROOT, out), JSON.stringify(artifact, null, 2));
  console.log(`Wrote ${out}`);
  return artifact;

  async function measure() {
    for (const step of androidNativeLaunchSteps(orientation)) {
      exec(serial, step.args);
      if (step.settle) await sleep(SETTLE_MS[step.settle]);
    }
    state.forwarded = true;
    const attached = await attachToBundledPage(serial, forwardPort);
    state.browser = attached.browser;
    const page = attached.page;
    const pageUrl = page.url();
    const identityProblem = bundledPageProblem(pageUrl);
    if (identityProblem) throw new Error(identityProblem);

    await page.waitForFunction(
      () => document.querySelector('#drawingCanvas')?.getBoundingClientRect().width > 0,
      undefined,
      { timeout: PAGE_READY_TIMEOUT_MS }
    );
    const ua = await page.evaluate(() => navigator.userAgent);
    const uaProblem = runtimeUaProblem('android-capacitor-webview', ua);
    if (uaProblem) throw new Error(uaProblem);

    const execute = (script) => page.evaluate(`(() => {${script}})()`);
    state.execute = execute;
    const readGeometry = () => page.evaluate(PAGE_GEOMETRY_SCRIPT);
    // Orientation first: releasing the lock opens Settings and rotates the
    // Activity, and everything after this — theme, brush, the probe, the
    // gesture coordinates — has to happen in the geometry that gets measured.
    const rotation = await establishRequestedOrientation({
      orientation,
      readGeometry,
      releaseLock: () =>
        releaseNativeRotationLock(execute, {
          onInitial: (initial) => {
            if (initial?.lockedOrientation) state.lockToRestore = initial;
          },
        }),
      reassertRotation: () => {
        for (const command of androidRotationCommands(orientation)) exec(serial, command);
      },
    });
    await ensureCampaignTheme(execute, requestedTheme);
    const observedTheme = await readResolvedTheme(execute);
    await page.evaluate(brushPickScript(brush));
    const committed = await pollFor(
      async () => (await page.evaluate(() => window.__committedBrushMode?.())) === brush,
      BRUSH_COMMIT_TIMEOUT_MS,
      { intervalMs: 250 }
    );
    if (!committed) {
      const mode = await page.evaluate(() => window.__committedBrushMode?.());
      throw new Error(`the page committed ${mode ?? 'nothing'}, not ${brush}`);
    }

    const beforeContact = await readGeometry();
    const preContactProblem = orientationProblem(orientation, beforeContact);
    if (preContactProblem) throw new Error(`before contact, ${preContactProblem}`);
    await page.evaluate(GEOMETRY_WATCH_SCRIPT);

    await page.evaluate(
      probeConfigScript({ phases: 'blank', contactMs: PROBE_CONTACT_BUDGET_MS, hud: false })
    );
    const installed = await page.evaluate(
      `${readFileSync(PROBE_FILE, 'utf8')}\n!!window.__probe`
    );
    if (!installed) throw new Error('the probe did not install in the bundled page');

    if (input === 'adb') {
      console.log(`canvas ${JSON.stringify(beforeContact.canvas)} scale ${beforeContact.dpr}`);
      const instructions = androidGestureInstructions(
        trustedGestureActions(beforeContact.canvas, repeats, 0),
        { densityScale: beforeContact.dpr }
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

    // Refused rather than recorded: a capture whose page turned or resized is
    // not a measurement of the orientation it would be filed under.
    const afterContact = await readGeometry();
    const geometryChanges = await page.evaluate(() => window.__bundledGeometryChanges ?? null);
    const geometryProblem =
      geometryChangesProblem(geometryChanges) ?? geometryDriftProblem(beforeContact, afterContact);
    if (geometryProblem) throw new Error(geometryProblem);

    const summaries = summarizeRun(report);
    const runtime = captureRuntime('android', true);
    const fidelity = inputFidelity(summaries.phases?.[0]?.input ?? {}, runtime);
    const drawing = scoreDrawingRun(summaries.phases, LOST_FRAME_TIME_SHARE_GATE);
    const measured = {
      label: runLabel,
      platform: 'android',
      brush,
      orientation,
      // What the page measured, not what was requested — the capture refuses
      // to reach this point unless the two agree.
      observedOrientation: observedOrientation(beforeContact),
      pageGeometry: { launched: rotation.launched, beforeContact, afterContact },
      rotationLock: {
        released: rotation.lockReleased,
        initial: state.lockToRestore,
      },
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

    console.log(
      `\nObserved ${measured.observedOrientation} ${beforeContact.viewport.width}x${beforeContact.viewport.height}` +
        (rotation.lockReleased ? ' (app rotation lock released for the capture)' : '')
    );
    console.log(
      `Fidelity: ${fidelity.passed ? 'PASS' : 'FAIL'} (${fidelity.runtime}) · ` +
        JSON.stringify(fidelity.checks)
    );
    if (!fidelity.passed) console.log(`  not passing: ${describeFidelityFailures(fidelity)}`);
    for (const phase of drawing.phases) {
      console.log(
        `  ${phase.phase}: lost ${(phase.lostFrameTimeShare * 100).toFixed(2)}% · ` +
          `paint max ${phase.paint.max}ms · ${phase.passed ? 'PASS' : 'FAIL'}`
      );
    }
    return measured;
  }
}

// Each step runs whatever the others do, and reports its own outcome so the
// artifact can say whether the rig was put back rather than assume it. `adb`
// is injectable only so tests can drive the ordering and isolation without a
// device.
export async function restoreCaptureState({
  serial,
  forwardPort,
  previousRotation,
  state,
  adb = exec,
}) {
  const steps = [];
  const attempt = async (step, action) => {
    try {
      await action();
      steps.push({ step, ok: true });
    } catch (error) {
      console.warn(`${step} failed: ${error.message}`);
      steps.push({ step, ok: false, error: error.message });
    }
  };
  if (state.lockToRestore) {
    await attempt('app rotation lock restore', () =>
      restoreNativeRotationLock(state.execute, state.lockToRestore)
    );
  }
  if (state.browser) await attempt('CDP close', () => state.browser.close());
  if (state.forwarded) {
    await attempt('forward removal', () =>
      adb(serial, ['forward', '--remove', `tcp:${forwardPort}`])
    );
  }
  for (const command of androidRotationRestoreCommands(previousRotation)) {
    await attempt(`rotation restore (${command.slice(-2).join(' ')})`, () =>
      adb(serial, command)
    );
  }
  return steps;
}

if (isMain(import.meta.url)) runMain(captureBundledFrames);
