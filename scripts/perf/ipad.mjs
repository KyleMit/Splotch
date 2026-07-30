// iPad profiling entry: drive the /dev/engine gates run on a USB-connected
// iPad and read the table back, so an on-device measurement costs a command
// instead of a Web Inspector round trip (reload the tab, re-attach, re-paste
// the driver from disk, copy the table back — six of those per verification,
// each one a chance to measure a stale bundle or a silently narrowed run).
//
//   npm run perf:ipad
//   npm run perf:ipad -- --scenarios=crayon-scribbles
//   npm run perf:ipad --ignore-scripts        (skip the rebuild)
//
// This is the automated form of Approach A in the profiling skill's
// ipad-device-profiling.md, which stays the fallback and still owns the
// Timeline run — the protocol's Timeline domain is not the shape
// `npm run perf:ios:analyze` parses, so recording stays manual.
//
// Local-only. Needs `ios_webkit_debug_proxy` (brew install
// ios-webkit-debug-proxy), an unlocked USB-connected iPad trusting this Mac
// with Settings → Apps → Safari → Advanced → Web Inspector on, and Safari
// open on at least one tab — a device with no tab exposes no page to attach to.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, hasCommand, isMain, pollUntil, runMain, sleep } from '../lib/proc.mjs';
import { lanAddresses, waitForUrl } from '../lib/net.mjs';
import { parsePerfArgs } from './args.mjs';
import { profilePath } from './paths.mjs';
import { warnIfNoPerfMarks } from './warnings.mjs';
import { spawnPerfServe } from './serve.mjs';
import {
  PROXY_COMMAND,
  attachToPage,
  listPages,
  startInspectorProxy,
  waitForDevice,
} from './webkit-inspector.mjs';

const HARNESS_PATH = '/dev/engine';
const DRIVER_FILE = join(ROOT, 'scripts', 'perf', 'ipad-console-driver.js');

const EXISTING_SERVER_PROBE_MS = 1_500;
const SERVER_READY_TIMEOUT_MS = 90_000;
const PAGE_LIST_TIMEOUT_MS = 20_000;
const PAGE_LIST_POLL_INTERVAL_MS = 500;
const NAVIGATION_SETTLE_MS = 1_500;
const HARNESS_READY_TIMEOUT_MS = 60_000;
const HARNESS_POLL_INTERVAL_MS = 500;
// Long enough for a live tab under load to answer a trivial evaluate, short
// enough that walking several suspended tabs stays quick.
const LIVENESS_PROBE_TIMEOUT_MS = 5_000;
// Four scenarios × 22 strokes at real op volume runs a couple of minutes; the
// cap is loose enough that a slow device is not mistaken for a hung one.
const GATES_TIMEOUT_MS = 20 * 60_000;
const ROWS_POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

function requireProxy() {
  if (hasCommand(PROXY_COMMAND)) return;
  fail(
    `${PROXY_COMMAND} is not installed — it relays the iPad's WebKit inspector ` +
      'channel over USB. Install it with:\n  brew install ios-webkit-debug-proxy'
  );
}

export function resolveHarnessUrl(explicit, port) {
  if (explicit) return explicit;
  const [address] = lanAddresses();
  if (!address) {
    fail('No LAN address for the iPad to reach this Mac at. Join a Wi-Fi network, or pass --url=');
  }
  return `http://${address}:${port}${HARNESS_PATH}`;
}

const reachable = (url, timeoutMs) =>
  waitForUrl(url, timeoutMs).then(
    () => true,
    () => false
  );

async function ensureServer(harnessUrl, port, allowSpawn) {
  if (await reachable(harnessUrl, EXISTING_SERVER_PROBE_MS)) {
    console.log(`Serving already: ${harnessUrl}`);
    return null;
  }
  if (!allowSpawn) fail(`Nothing is serving ${harnessUrl}. Start it with: npm run perf:serve`);
  console.log('Starting the preview server…');
  // The same port harnessUrl was derived from, strictly: a fall-forward would
  // leave this waiting out its whole budget on a URL nothing ever binds.
  const server = spawnPerfServe(port);
  await waitForUrl(harnessUrl, SERVER_READY_TIMEOUT_MS);
  console.log(`Serving: ${harnessUrl}`);
  return server;
}

// iOS suspends a backgrounded Safari tab: it still lists, and still announces an
// inspector target, but it never runs JS — so a command against it hangs instead
// of failing, and the first-listed tab is not reliably the foreground one. A
// short-budget probe is the only way to tell them apart.
async function findResponsivePage(device, accept = () => true) {
  for (const page of await listPages(device)) {
    if (!accept(page)) continue;
    let session;
    try {
      session = await attachToPage(page.webSocketDebuggerUrl, {
        commandTimeoutMs: LIVENESS_PROBE_TIMEOUT_MS,
      });
      await session.evaluate('1');
      return page;
    } catch {
      // Suspended, or the tab went away mid-probe.
    } finally {
      session?.close();
    }
  }
  return null;
}

// Navigates the live tab to the harness rather than trusting one that already
// shows it: a tab left over from an earlier run keeps serving that run's bundle,
// and nothing about its URL says so.
async function openHarness(device, harnessUrl, onConsole) {
  const pages = await pollUntil(
    async () => {
      const open = await listPages(device);
      return open.length ? open : null;
    },
    PAGE_LIST_TIMEOUT_MS,
    PAGE_LIST_POLL_INTERVAL_MS
  );
  if (!pages) {
    fail(
      'The iPad exposes no Safari pages. Open Safari on the device with at least one ' +
        'tab, and turn on Settings → Apps → Safari → Advanced → Web Inspector.'
    );
  }

  const live = await pollUntil(
    () => findResponsivePage(device),
    PAGE_LIST_TIMEOUT_MS,
    PAGE_LIST_POLL_INTERVAL_MS
  );
  if (!live) {
    fail(
      `None of the iPad's ${pages.length} Safari tab(s) answered. Bring Safari to the ` +
        'foreground, unlock the device, and keep the screen awake — iOS suspends a ' +
        'backgrounded tab, and a suspended tab never runs the driver.'
    );
  }

  const opener = await attachToPage(live.webSocketDebuggerUrl);
  await opener.evaluate(`location.replace(${JSON.stringify(harnessUrl)})`);
  opener.close();
  await sleep(NAVIGATION_SETTLE_MS);

  // Matched on URL *and* responsiveness: with several tabs open, the one showing
  // the harness URL is not necessarily the one that will run anything.
  const loaded = await pollUntil(
    () => findResponsivePage(device, (page) => page.url === harnessUrl),
    HARNESS_READY_TIMEOUT_MS,
    HARNESS_POLL_INTERVAL_MS
  );
  if (!loaded) {
    fail(
      `The iPad never reported a responsive tab on ${harnessUrl}. Check that the device is ` +
        'on the same Wi-Fi as this Mac and can reach that address.'
    );
  }

  const session = await attachToPage(loaded.webSocketDebuggerUrl, { onConsole });
  const ready = await pollUntil(
    () =>
      session.readJson('!!(window.__engine && window.__engine.getUndoDebug)').catch(() => false),
    HARNESS_READY_TIMEOUT_MS,
    HARNESS_POLL_INTERVAL_MS
  );
  if (!ready) {
    session.close();
    fail(
      `${harnessUrl} loaded but never exposed window.__engine. Serve a build made with ` +
        'PUBLIC_ENABLE_DEV_HARNESS=true (npm run perf:serve does).'
    );
  }
  return session;
}

// Every override is assigned, not only the ones passed: a window.__perfScenarios
// left behind by an earlier run quietly scoping a "full" run to one scenario is
// the second failure this entry point exists to remove.
export function runOverridesScript({ scenarios, strokes, ops }) {
  const assign = (name, value) =>
    `window.${name} = ${value === undefined ? 'undefined' : JSON.stringify(value)};`;
  return [
    assign('__perfScenarios', scenarios),
    assign('__perfStrokes', strokes),
    assign('__perfOps', ops),
    // Gates mode. Timeline mode is a Web Inspector recording, so it stays manual.
    assign('__perfTimeline', undefined),
    assign('__perfRows', undefined),
  ].join('\n');
}

async function waitForRows(session, driverError, timeoutMs) {
  const start = Date.now();
  const deadline = start + timeoutMs;
  let nextHeartbeat = start + HEARTBEAT_INTERVAL_MS;
  while (Date.now() < deadline) {
    const stopped = driverError();
    if (stopped) throw new Error(`The driver stopped early:\n${stopped}`);
    const rows = await session.readJson('window.__perfRows ?? null');
    if (rows) return rows;
    if (Date.now() >= nextHeartbeat) {
      console.log(`  … running (${Math.round((Date.now() - start) / 1000)}s)`);
      nextHeartbeat += HEARTBEAT_INTERVAL_MS;
    }
    await sleep(ROWS_POLL_INTERVAL_MS);
  }
  throw new Error(
    `window.__perfRows never appeared within ${Math.round(timeoutMs / 60_000)} min. ` +
      'Keep the iPad awake with the harness tab in the foreground while it runs.'
  );
}

export async function runIpadProfile(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    { entry: true, extra: ['url', 'scenarios', 'strokes', 'ops', 'device-id', 'no-serve'] },
    argv
  );
  requireProxy();
  warnIfNoPerfMarks('npm run perf:ipad');

  const harnessUrl = resolveHarnessUrl(flag('url'), port);
  const server = await ensureServer(harnessUrl, port, !has('no-serve'));

  const { stop: stopProxy } = startInspectorProxy();
  const device = await waitForDevice(flag('device-id'));
  if (!device) {
    stopProxy();
    fail(
      'No iOS device on the inspector relay. Connect the iPad by USB, unlock it, tap ' +
        'Trust This Computer, and turn on Settings → Apps → Safari → Advanced → Web Inspector.'
    );
  }
  console.log(`Device: ${device.deviceName} (iOS ${device.deviceOSVersion})`);

  const messages = [];
  const onConsole = (message) => {
    messages.push(message);
    // The driver's own narration is the run's progress report; its table is
    // re-rendered from __perfRows, so the table message itself is noise here.
    if (message.source === 'console-api' && message.type !== 'table') {
      console.log(`  [iPad] ${message.text}`);
    }
  };
  const driverError = () =>
    messages.find((message) => message.level === 'error' && message.source === 'console-api')?.text;

  let session;
  try {
    session = await openHarness(device, harnessUrl, onConsole);
    await session.evaluate(
      runOverridesScript({
        scenarios: flag('scenarios'),
        strokes: flag('strokes') && Number(flag('strokes')),
        ops: flag('ops') && Number(flag('ops')),
      })
    );
    // The driver is an async IIFE and WebKit's Runtime.evaluate has no
    // awaitPromise, so this returns the moment the run starts; the results
    // global is what the run is tracked by.
    await session.evaluate(readFileSync(DRIVER_FILE, 'utf8'));
    const rows = await waitForRows(session, driverError, GATES_TIMEOUT_MS);

    console.table(rows);
    const outDir = profilePath('ipad', device.deviceName.replace(/[^\w.-]+/g, '-'));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, 'ipad-gates.json'),
      `${JSON.stringify(
        {
          device: { name: device.deviceName, os: device.deviceOSVersion, id: device.deviceId },
          harnessUrl,
          rows,
          console: messages.map(({ level, text }) => ({ level, text })),
        },
        null,
        2
      )}\n`
    );
    console.log(`\nWrote ${join(outDir, 'ipad-gates.json')}`);
    return rows;
  } finally {
    session?.close();
    stopProxy();
    server?.stop();
  }
}

if (isMain(import.meta.url)) runMain(runIpadProfile);
