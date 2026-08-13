// iPad profiling entry: drive the /dev/engine gates run on a USB-connected
// iPad and read the table back, so an on-device measurement costs a command
// instead of a Web Inspector round trip (reload the tab, re-attach, re-paste
// the driver from disk, copy the table back — six of those per verification,
// each one a chance to measure a stale bundle or a silently narrowed run).
//
//   npm run perf:ios:webkit:gates
//   npm run perf:ios:webkit:gates -- --scenarios=crayon-scribbles
//   npm run perf:ios:webkit:gates --ignore-scripts        (skip the rebuild)
//
// This is the automated form of Approach A in the profiling skill's
// docs/PROFILING-IPAD.md, which stays the fallback and still owns the
// Timeline run — the protocol's Timeline domain is not the shape
// `npm run perf:analyze:web-inspector` parses, so recording stays manual. For what the
// gates structurally cannot see — compositor cost and frame pacing on the real
// screen — see `npm run perf:ios:webkit:frames`.
//
// Local-only. Needs `ios_webkit_debug_proxy` (brew install
// ios-webkit-debug-proxy), an unlocked USB-connected iPad trusting this Mac
// with Settings → Apps → Safari → Advanced → Web Inspector on, and Safari
// open on at least one tab — a device with no tab exposes no page to attach to.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, runMain } from '../../lib/proc.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { warnIfNoPerfMarks } from '../lib/profile-warnings.mjs';
import {
  connectDevice,
  createDeviceConsole,
  ensurePreviewServer,
  openDevicePage,
  requireInspectorProxy,
  resolveDeviceUrl,
  waitForGlobal,
} from '../lib/profile-device-session.mjs';

const HARNESS_PATH = '/dev/engine';
const DRIVER_FILE = join(ROOT, 'tools', 'perf', 'probes', 'engine-gates.js');

// Four scenarios × 22 strokes at real op volume runs a couple of minutes; the
// cap is loose enough that a slow device is not mistaken for a hung one.
const GATES_TIMEOUT_MS = 20 * 60_000;

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

export async function runIpadProfile(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    { entry: true, extra: ['url', 'scenarios', 'strokes', 'ops', 'device-id', 'no-serve'] },
    argv
  );
  requireInspectorProxy();
  warnIfNoPerfMarks('npm run perf:ios:webkit:gates');

  const harnessUrl = resolveDeviceUrl(flag('url'), port, HARNESS_PATH);
  const server = await ensurePreviewServer(harnessUrl, port, !has('no-serve'));

  const { device, stopProxy } = await connectDevice(flag('device-id'));

  // The driver's own narration is the run's progress report; its table is
  // re-rendered from __perfRows, so the table message itself is noise here.
  const deviceConsole = createDeviceConsole({ echo: (message) => message.type !== 'table' });

  let session;
  try {
    session = await openDevicePage(device, harnessUrl, {
      onConsole: deviceConsole.onConsole,
      ready: 'window.__engine && window.__engine.getUndoDebug',
      readyHint:
        'never exposed window.__engine. Serve a build made with ' +
        'PUBLIC_ENABLE_DEV_HARNESS=true (npm run perf:serve does).',
    });
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
    const rows = await waitForGlobal(session, 'window.__perfRows', {
      stalled: deviceConsole.errorText,
      timeoutMs: GATES_TIMEOUT_MS,
      timeoutHint: 'Keep the iPad awake with the harness tab in the foreground while it runs.',
    });

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
          console: deviceConsole.forReport(),
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
