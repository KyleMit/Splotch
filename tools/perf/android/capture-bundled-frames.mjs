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
import {
  BRUSH_BUTTON_BY_MODE,
  STROKES_PER_GESTURE_REPEAT,
  trustedGestureActions,
} from '../ios/capture-xcuitest-screen.mjs';
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
import {
  GESTURE_REPEATS,
  anomalousEraserRefills,
  eraserRefillShortfall,
  gesturePlanFor,
} from '../lib/campaign-plan.mjs';
import {
  ERASER_FILL_BACKING_TIMEOUT_MS,
  ERASER_REFILL_IDLE_FRAMES,
  eraserFillFunctionSource,
  eraserInkCensusFunctionSource,
} from '../lib/eraser-fill.mjs';

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
// The product's persisted eraser size key. Tools cannot import storageKeys.ts
// (the Vitest tools tier has no SvelteKit tsconfig to transform it), so the
// value is restated here and android-bundled-eraser.test.mjs drift-guards it
// against web/src/lib/storageKeys.ts.
export const ERASER_WIDTH_STORAGE_KEY = 'splotch-eraser-width-size';
const ERASER_FILL_POLL_MS = 100;
// How long a pass's strokes may take to settle in the page's event table after
// the final `input swipe` returns; the swipe call itself blocks until it ends.
const PASS_LIFTS_TIMEOUT_MS = 3_000;
const PASS_LIFTS_POLL_MS = 100;
// The probe's events row layout (real-screen-probe.js): type, onCanvas, and
// trusted columns, and the type codes for down, up, and cancel.
const EVENT_TYPE = 2;
const EVENT_ON_CANVAS = 6;
const EVENT_TRUSTED = 8;
const POINTER_DOWN = 0;
const POINTER_UP = 2;
const POINTER_CANCEL = 3;

// How often an interrupted capture notices the signal while it waits — a
// 20 s hand window must not hold the rig unrestored until it ends.
const INTERRUPT_POLL_MS = 250;

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
// Activity stayed at ROTATION_0 through this function's whole follow timeout,
// and turned only once `user_rotation` was written again — the same value is
// enough. Hence `reassertRotation`.
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

// Floor on the share of census samples one eraser pass must clear. By path
// length times width, the fixed gesture at the smallest eraser level (4 px
// nominal) sweeps roughly 3% of a portrait canvas; a blank-paper or
// non-erasing pass clears none. The floor sits well under the first and far
// above the second.
const ERASER_PASS_MIN_ERASED_FRACTION = 0.005;

const indexed = (census) => (census?.tiles ?? []).map((tile, index) => ({ index, ...tile }));
const total = (census, key) => indexed(census).reduce((sum, tile) => sum + tile[key], 0);

export function censusSummary(census) {
  return {
    tiles: census?.tiles?.length ?? 0,
    samples: total(census, 'samples'),
    opaque: total(census, 'opaque'),
    erased: total(census, 'erased'),
    backings: indexed(census).map((tile) => tile.backing),
  };
}

export function inkPreparedProblem(census, pass) {
  if (!census || census.error) {
    return `before pass ${pass}, the ink census failed: ${census?.error ?? 'no result'}`;
  }
  if (!census.tiles?.length) return `before pass ${pass}, the ink census found no live tiles`;
  const thin = indexed(census).filter((tile) => tile.samples === 0 || tile.opaque !== tile.samples);
  if (!thin.length) return null;
  return (
    `before pass ${pass}, the paper is not fully inked where the eraser will travel: ` +
    thin.map((tile) => `tile ${tile.index} ${tile.opaque}/${tile.samples} opaque`).join(', ')
  );
}

export function erasurePassProblem(before, after, pass) {
  if (!after || after.error) {
    return `after pass ${pass}, the ink census failed: ${after?.error ?? 'no result'}`;
  }
  const beforeTiles = indexed(before);
  const afterTiles = indexed(after);
  if (afterTiles.length !== beforeTiles.length) {
    return `pass ${pass} changed the live tile count ${beforeTiles.length} -> ${afterTiles.length}`;
  }
  const resized = afterTiles.filter((tile) => tile.backing !== beforeTiles[tile.index].backing);
  if (resized.length) {
    return (
      `pass ${pass} changed tile backings (` +
      resized.map((tile) => `tile ${tile.index} ${beforeTiles[tile.index].backing} -> ${tile.backing}`).join(', ') +
      '), which is a resize, not an erase'
    );
  }
  const wiped = afterTiles.filter((tile) => tile.opaque === 0);
  if (wiped.length) {
    return (
      `pass ${pass} left tiles ${wiped.map((tile) => tile.index).join(', ')} with no ink at all, ` +
      'which is a clear, not an erase along the gesture'
    );
  }
  const erased = total(after, 'erased');
  const samples = total(after, 'samples');
  if (erased / samples < ERASER_PASS_MIN_ERASED_FRACTION) {
    return (
      `pass ${pass} erased ${erased} of ${samples} census samples, under the ` +
      `${ERASER_PASS_MIN_ERASED_FRACTION * 100}% floor, so the stroke removed no measurable ink`
    );
  }
  return null;
}

// Every stroke that reached the page must have ended — as many trusted
// canvas lifts as downs, and no cancel — before the census reads the result
// or the refill paints over it. Delivery is RECORDED, not required to match
// the plan: on the rig phone in portrait, a swipe that starts at one screen
// point (the centre, where two of the plan's sixteen segments begin) delivers
// no pointer events to the page at all, for every brush alike (see the
// 2026-09-19 eraser evidence package). Whether each pass removed ink is the
// census's question.
export function passLiftProblem(lifts, pass) {
  if (lifts.cancels) return `pass ${pass} saw ${lifts.cancels} trusted canvas pointercancel(s)`;
  if (lifts.downs === 0) return `pass ${pass} delivered no trusted canvas stroke to the page`;
  if (lifts.downs !== lifts.ups) {
    return (
      `pass ${pass} ended with a stroke still in contact: ` +
      `${lifts.downs} pointerdowns, ${lifts.ups} pointerups`
    );
  }
  return null;
}

export function strokeDelivery(events, geometry, repeats) {
  const planned =
    androidGestureInstructions(trustedGestureActions(geometry.canvas, 1, 0), {
      densityScale: geometry.dpr,
    }).filter((instruction) => instruction.kind === 'swipe').length * repeats;
  const delivered = events.filter(
    (row) =>
      row[EVENT_TYPE] === POINTER_DOWN && row[EVENT_ON_CANVAS] === 1 && row[EVENT_TRUSTED] === 1
  ).length;
  return { planned, delivered };
}

const evaluateInPage = (page, source, call) =>
  page.evaluate(`(() => {\n${source}\nreturn ${call};\n})()`);
const fillEraserInk = (page, verifyOnly = false) =>
  evaluateInPage(page, eraserFillFunctionSource(), `fillEraserInk(${verifyOnly})`);
const inkCensus = (page) => evaluateInPage(page, eraserInkCensusFunctionSource(), 'eraserInkCensus()');
const idleFrames = (page) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let remaining = count;
        const tick = () => {
          remaining -= 1;
          if (remaining <= 0) resolve(true);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ERASER_REFILL_IDLE_FRAMES
  );

// The shared fill, verified rather than trusted (issue 1302), exactly as the
// Appium runner applies it: wait out deferred tile-backing realization, prove
// the paint opaque, then check again WITHOUT painting after a settle so a wipe
// inside that window is recorded (`repairedAfterSettle`) instead of hidden.
async function prepareEraserInk(page, fence) {
  const fillVerified = async () => {
    const deadline = Date.now() + ERASER_FILL_BACKING_TIMEOUT_MS;
    let fill = await fillEraserInk(page);
    while ((fill?.pending || fill?.transparentTiles?.length) && Date.now() < deadline) {
      await fence.wait(ERASER_FILL_POLL_MS);
      fill = await fillEraserInk(page);
    }
    if (fill?.pending) {
      throw new Error(`live tile backings never realized for the eraser fill: ${fill.pending.join(', ')}`);
    }
    if (!fill || fill.transparentTiles?.length) {
      throw new Error(`the eraser fill left tiles transparent: ${JSON.stringify(fill)}`);
    }
    return fill;
  };
  const fill = await fillVerified();
  await fence.wait(AFTER_GESTURE_SETTLE_MS);
  const afterSettle = await fillEraserInk(page, true);
  if (afterSettle?.pending || afterSettle?.transparentTiles?.length) {
    return { ...(await fillVerified()), repairedAfterSettle: true, settleWipe: afterSettle };
  }
  return fill;
}

async function passLifts(page, fromEvent) {
  const counts = await page.evaluate(() => window.__probe.counts());
  const rows = await page.evaluate(
    ([from, count]) => window.__probe.events(from, count),
    [fromEvent, counts.events - fromEvent]
  );
  const trustedOnCanvas = rows.filter(
    (row) => row[EVENT_ON_CANVAS] === 1 && row[EVENT_TRUSTED] === 1
  );
  const count = (type) => trustedOnCanvas.filter((row) => row[EVENT_TYPE] === type).length;
  return { downs: count(POINTER_DOWN), ups: count(POINTER_UP), cancels: count(POINTER_CANCEL) };
}

// One authored pass at a time, each bracketed by proof (issue 2065's device
// validation found this CLI erasing blank paper under a `refilled` label):
// before the pass, a full-lattice census proves ink under the whole canvas;
// after it, the page must have received every planned stroke as a trusted
// down/up pair with nothing still in contact, and the census must show the
// stroke removed ink without resizing or clearing a tile. Every readback, the
// refill, and the idle frames that separate them from the next contact run
// between passes, outside the in-contact frames the drawing gate scores.
export async function driveEraserPasses({ page, fence, repeats, canvas, dpr, dispatchSwipe }) {
  const instructions = androidGestureInstructions(trustedGestureActions(canvas, 1, 0), {
    densityScale: dpr,
  });
  const strokes = instructions.filter((instruction) => instruction.kind === 'swipe').length;
  const passes = [];
  const refills = [];
  let trustedCanvasPointerUps = 0;
  for (let pass = 1; pass <= repeats; pass += 1) {
    const before = await inkCensus(page);
    const unprepared = inkPreparedProblem(before, pass);
    if (unprepared) throw new Error(unprepared);
    await idleFrames(page);
    const fromEvent = (await page.evaluate(() => window.__probe.counts())).events;
    for (const instruction of instructions) {
      fence.checkpoint();
      if (instruction.kind === 'pause') await fence.wait(instruction.durationMs);
      else dispatchSwipe(instruction);
    }
    // Settled means every down has its up and the counts held for one poll.
    const deadline = Date.now() + PASS_LIFTS_TIMEOUT_MS;
    let previous = null;
    let lifts = await passLifts(page, fromEvent);
    while (
      (lifts.downs !== lifts.ups || JSON.stringify(lifts) !== JSON.stringify(previous)) &&
      Date.now() < deadline
    ) {
      await fence.wait(PASS_LIFTS_POLL_MS);
      previous = lifts;
      lifts = await passLifts(page, fromEvent);
    }
    const liftProblem = passLiftProblem(lifts, pass);
    if (liftProblem) throw new Error(liftProblem);
    trustedCanvasPointerUps += lifts.ups;
    const after = await inkCensus(page);
    const erasure = erasurePassProblem(before, after, pass);
    if (erasure) throw new Error(erasure);
    passes.push({
      pass,
      plannedStrokes: strokes,
      lifts,
      before: censusSummary(before),
      after: censusSummary(after),
    });
    if (pass === repeats) break;
    const fill = await fillEraserInk(page);
    const refill = {
      afterStroke: pass * STROKES_PER_GESTURE_REPEAT,
      pending: Boolean(fill?.pending),
      transparentTiles: fill?.transparentTiles ?? [],
      trustedCanvasPointerUps,
    };
    refills.push(refill);
    if (refill.pending || refill.transparentTiles.length) {
      throw new Error(`the eraser refill after pass ${pass} failed: ${JSON.stringify(fill)}`);
    }
  }
  return { passes, refills };
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
  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    throw new Error('--gesture-repeats must be a positive integer');
  }
  // A hand capture has no pass boundaries to refill between and no planned
  // path to prove, so an eraser cell there would measure blank paper.
  if (brush === 'eraser' && input === 'hand') {
    throw new Error('--brush=eraser needs --input=adb: a hand capture cannot be fed verified ink');
  }
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
  const fence = createInterruptFence();
  const onSigint = () => fence.onSignal(130);
  const onSigterm = () => fence.onSignal(143);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  let artifact;
  try {
    artifact = await measure();
  } finally {
    const restored = await restoreCaptureState({ serial, forwardPort, previousRotation, state });
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    if (artifact) artifact.cleanup = restored;
    fence.exitIfInterrupted();
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
      fence.checkpoint();
      exec(serial, step.args);
      if (step.settle) await fence.wait(SETTLE_MS[step.settle]);
    }
    fence.checkpoint();
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
    fence.checkpoint();
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
    fence.checkpoint();
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

    const eraserFill = brush === 'eraser' ? await prepareEraserInk(page, fence) : null;
    const eraserWidthSetting =
      brush === 'eraser'
        ? await page.evaluate((key) => localStorage.getItem(key), ERASER_WIDTH_STORAGE_KEY)
        : null;

    fence.checkpoint();
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

    let eraser = null;
    if (input === 'adb' && brush === 'eraser') {
      console.log(`canvas ${JSON.stringify(beforeContact.canvas)} scale ${beforeContact.dpr}`);
      eraser = await driveEraserPasses({
        page,
        fence,
        repeats,
        canvas: beforeContact.canvas,
        dpr: beforeContact.dpr,
        dispatchSwipe: (instruction) => exec(serial, swipeArgs(instruction)),
      });
    } else if (input === 'adb') {
      console.log(`canvas ${JSON.stringify(beforeContact.canvas)} scale ${beforeContact.dpr}`);
      const instructions = androidGestureInstructions(
        trustedGestureActions(beforeContact.canvas, repeats, 0),
        { densityScale: beforeContact.dpr }
      );
      for (const instruction of instructions) {
        fence.checkpoint();
        if (instruction.kind === 'pause') await fence.wait(instruction.durationMs);
        else exec(serial, swipeArgs(instruction));
      }
    } else {
      console.log(`\nDraw ${brush} strokes on the device for ~${seconds}s.`);
      for (let tick = HAND_COUNTDOWN_SECONDS; tick > 0; tick -= 1) {
        console.log(`  starting in ${tick}…`);
        await fence.wait(1_000);
      }
      console.log('  GO — drawing window open');
      await fence.wait(seconds * 1_000);
      console.log('  window closed');
    }
    fence.checkpoint();
    await fence.wait(AFTER_GESTURE_SETTLE_MS);

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

    const strokes = input === 'adb' ? strokeDelivery(report.events, beforeContact, repeats) : null;
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
      // What the plan sent versus what reached the page as trusted canvas
      // strokes; see passLiftProblem for the portrait delivery gap.
      strokes,
      // The verified evidence behind that plan for an eraser cell: the initial
      // fill, one refill per pass boundary (the shape the campaign readers
      // check), and each pass's before/after ink census and stroke lifts.
      eraserFill,
      eraserRefills: eraser?.refills ?? null,
      eraserPasses: eraser?.passes ?? null,
      // The persisted eraser size level as stored; null is the product default.
      eraserWidthSetting,
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

    const anomalous = anomalousEraserRefills(measured);
    if (anomalous?.length) throw new Error(`anomalous eraser refills: ${JSON.stringify(anomalous)}`);
    const shortfall = eraserRefillShortfall(measured, repeats);
    if (shortfall) throw new Error(`eraser refill shortfall: ${JSON.stringify(shortfall)}`);
    if (brush === 'eraser' && eraser?.passes?.length !== repeats) {
      throw new Error(`the eraser capture proved ${eraser?.passes?.length ?? 0} of ${repeats} passes`);
    }
    if (eraser) {
      for (const pass of eraser.passes) {
        console.log(
          `eraser pass ${pass.pass}: ${pass.lifts.ups}/${pass.plannedStrokes} strokes, ` +
            `erased ${pass.after.erased}/${pass.after.samples} census samples`
        );
      }
    }

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

// A signal must not run cleanup alongside the capture: an unlock already in
// flight would land after the lock was restored and leave the app unlocked (the
// PR 2083 review reproduced exactly that). So the first signal only marks the
// run interrupted; the capture stops at its next checkpoint, the one cleanup
// path in `finally` restores the rig, and only then does the process exit with
// the signal's code. A second signal exits at once, leaking what cleanup would
// have restored, for an operator who would rather have the terminal back.
// Every wait inside the capture goes through `wait`, which checks the fence
// between bounded slices, so no timer outlives an interrupt by more than one
// slice.
export function createInterruptFence({
  exit = (code) => process.exit(code),
  warn = console.warn,
  pause = sleep,
  sliceMs = INTERRUPT_POLL_MS,
} = {}) {
  let interruptedWith = null;
  const checkpoint = () => {
    if (interruptedWith !== null) throw new Error('interrupted before the capture finished');
  };
  return {
    onSignal(exitCode) {
      if (interruptedWith !== null) {
        warn('second signal: exiting without restoring the rig');
        exit(exitCode);
        return;
      }
      interruptedWith = exitCode;
      warn('interrupted: stopping at the next step, then restoring the rig (signal again to skip)');
    },
    checkpoint,
    async wait(ms) {
      let remaining = ms;
      checkpoint();
      while (remaining > 0) {
        const slice = Math.min(sliceMs, remaining);
        await pause(slice);
        remaining -= slice;
        checkpoint();
      }
    },
    exitIfInterrupted() {
      if (interruptedWith !== null) exit(interruptedWith);
    },
  };
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
