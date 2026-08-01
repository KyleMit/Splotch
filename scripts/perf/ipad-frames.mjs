// Real-screen profiling entry: measure frame pacing, input delay and paint
// latency on the app users actually touch (`/`) on a USB-connected iPad.
//
//   npm run perf:ipad:frames                       hand-drawn, full phase sweep
//   npm run perf:ipad:frames -- --phases=blank,page
//   npm run perf:ipad:frames -- --contact-seconds=15
//   npm run perf:ipad:frames -- --free-draw=60
//
// The sibling `npm run perf:ipad` drives /dev/engine and answers "how expensive
// is an engine operation". This answers "does the screen keep up", which is a
// different question with different instruments: the gates run passes every
// ADR-0066 threshold on hardware while the real screen visibly lags, because
// the real screen pays for the line-art blend recomposite, PointerHalos' DOM
// writes, per-stroke Svelte reactivity and the real paper geometry — none of
// which make an `engine.*` measure larger.
//
// The measuring happens in scripts/perf/real-screen-probe.js on the device; the
// maths is in real-screen-stats.mjs; this file is the plumbing between them.
//
// Local-only, same device prerequisites as `perf:ipad` (see the profiling
// skill's ipad-device-profiling.md).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, isMain, runMain } from '../lib/proc.mjs';
import { parsePerfArgs } from './args.mjs';
import { profilePath } from './paths.mjs';
import { warnIfNoPerfMarks } from './warnings.mjs';
import {
  connectDevice,
  createDeviceConsole,
  ensurePreviewServer,
  openDevicePage,
  requireInspectorProxy,
  resolveDeviceUrl,
  waitForGlobal,
} from './ipad-session.mjs';
import { createTimelineCounter, timelineRows } from './timeline-records.mjs';
import {
  comparisonRows,
  engineRows,
  inputRows,
  pacingRows,
  starvationRows,
  summarizeRun,
} from './real-screen-stats.mjs';

const APP_PATH = '/';
const PROBE_FILE = join(ROOT, 'scripts', 'perf', 'real-screen-probe.js');

// A human drawing six phases at 25 s of contact each, plus the paper switching
// between them, is a few minutes; the budget is loose enough that a slow hand
// is never mistaken for a hung page.
const HAND_RUN_TIMEOUT_MS = 45 * 60_000;
const DEFAULT_CONTACT_SECONDS = 25;
// One Runtime.evaluate carrying a multi-hundred-KB JSON string across the USB
// relay is the one failure that would land AFTER the drawing is done, so the
// tables come back in slices.
const TABLE_CHUNK_ROWS = 2_000;
const PROBE_BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];

export function validateFreeDrawOptions(value, { bare = false, hud = true } = {}) {
  if (bare) throw new Error('--free-draw requires a duration: --free-draw=SECONDS');
  if (value === undefined) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('--free-draw must be a positive number of seconds');
  }
  if (!hud) {
    throw new Error(
      '--free-draw needs the on-device HUD: drop --no-hud, or add --hud when using --drive.'
    );
  }
  return seconds;
}

// Assigns every global the probe reads, including the ones not requested: the
// page is freshly navigated so nothing should be left over, but this is the same
// guarantee `perf:ipad`'s overrides script makes, for the same reason — a
// leftover config silently changes what a run measured and the output looks
// completely normal.
export function probeConfigScript({
  phases,
  contactMs,
  freeDrawSeconds,
  drive,
  driveHz,
  pointerType,
  brush,
  hud = true,
} = {}) {
  if (brush !== undefined && !PROBE_BRUSHES.includes(brush)) {
    throw new Error(`--brush must be one of ${PROBE_BRUSHES.join(', ')}`);
  }
  const assign = (name, value) =>
    `window.${name} = ${value === undefined ? 'undefined' : JSON.stringify(value)};`;
  return [
    assign('__probePhases', phases),
    assign('__probeContactMs', contactMs),
    assign('__probeFreeDraw', freeDrawSeconds),
    assign('__probeDrive', drive),
    assign('__probeDriveHz', driveHz),
    assign('__probePointerType', pointerType),
    assign('__probeBrush', brush),
    assign('__probeHud', hud === true ? undefined : hud),
    assign('__probeReport', undefined),
    assign('__probeProgress', undefined),
  ].join('\n');
}

async function readTable(session, accessor, total) {
  const rows = [];
  while (rows.length < total) {
    const slice = await session.readJson(
      `window.__probe.${accessor}(${rows.length}, ${TABLE_CHUNK_ROWS})`
    );
    if (!slice?.length) break;
    rows.push(...slice);
  }
  return rows;
}

function printHandInstructions(phases, contactSeconds) {
  console.log(
    [
      '',
      '── Draw on the iPad now ──────────────────────────────────────────────',
      "The iPad's own banner is the instruction — you do not need this terminal.",
      `  1. It asks for blank paper or a coloring page (${phases} phase(s) total).`,
      '  2. When it says "draw!", reproduce the lag you feel: long slow strokes',
      '     for the first half of a phase, rapid short strokes for the second.',
      `  3. Each phase banks ${contactSeconds}s of FINGER-DOWN time — lifting pauses the clock.`,
      '  4. Keep the device unlocked and Safari foregrounded throughout.',
      '──────────────────────────────────────────────────────────────────────',
      '',
    ].join('\n')
  );
}

export async function runIpadFrames(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    {
      entry: true,
      extra: [
        'url',
        'phases',
        'contact-seconds',
        'free-draw',
        'drive',
        'drive-hz',
        'pointer-type',
        'brush',
        'device-id',
        'no-serve',
        'no-hud',
        'hud',
        'timeline',
      ],
    },
    argv
  );
  requireInspectorProxy();
  warnIfNoPerfMarks('npm run perf:ipad:frames');

  const appUrl = resolveDeviceUrl(flag('url'), port, APP_PATH);
  const contactSeconds = Number(flag('contact-seconds', DEFAULT_CONTACT_SECONDS));
  const freeDrawValue = flag('free-draw');
  // `--drive` with no value is the useful default: one long stroke then a burst
  // of short ones, the two shapes the lag report names.
  const drive = has('drive') ? 'mixed' : flag('drive');
  const driveHz = flag('drive-hz') && Number(flag('drive-hz'));
  const pointerType = flag('pointer-type');
  const brush = flag('brush');
  const hud = has('hud') || (!has('no-hud') && !drive);
  // Wall-clock window behind a START tap, rather than banked finger-down time.
  const freeDrawSeconds = validateFreeDrawOptions(freeDrawValue, {
    bare: has('free-draw'),
    hud,
  });
  const probeConfig = probeConfigScript({
    phases: flag('phases'),
    contactMs: contactSeconds * 1000,
    freeDrawSeconds,
    drive,
    driveHz,
    pointerType,
    brush,
    hud,
  });
  const deviceConsole = createDeviceConsole();
  // Records carry no timestamps over the protocol, so their counts only mean
  // something for a single phase — see timeline-records.mjs.
  const timeline = has('timeline') ? createTimelineCounter() : null;
  if (timeline && (flag('phases') ?? '').split(',').filter(Boolean).length !== 1) {
    fail(
      '--timeline needs exactly one --phases= key: protocol Timeline records arrive with ' +
        'zeroed timestamps, so they cannot be attributed to a phase.'
    );
  }
  const server = await ensurePreviewServer(appUrl, port, !has('no-serve'));
  const { device, stopProxy } = await connectDevice(flag('device-id'));

  let session;
  try {
    session = await openDevicePage(device, appUrl, {
      onConsole: deviceConsole.onConsole,
      onEvent: timeline?.onEvent,
      // The real screen has no window.__engine to wait for — a live canvas with
      // a sized backing store is what "the app is running" looks like here.
      ready:
        "(() => { const c = document.querySelector('#drawingCanvas'); return c && c.width > 0; })()",
      readyHint:
        'never showed a sized #drawingCanvas. Confirm the tab is the real app at / ' +
        '(not /dev/engine) and that the page finished hydrating.',
    });
    // The HUD repaints twice a second and damages the blend layer some phases
    // isolate. Driven runs omit it unless --hud makes that cost part of the trial.
    await session.evaluate(probeConfig);
    await timeline?.start(session);
    await session.evaluate(readFileSync(PROBE_FILE, 'utf8'));

    const planned = await session.readJson('window.__probe ? 1 : 0');
    if (!planned) {
      throw new Error(
        'The probe did not install. Its own console error above says why (usually a ' +
          'selector it depends on is gone from the app).'
      );
    }
    if (drive) {
      const seam = await session.readJson('!!window.__drawingDebug');
      console.log(
        `\nDriving synthetic input (${drive}${driveHz ? ` at ${driveHz} Hz` : ' at one move per frame'}) — ` +
          `hands off the iPad, keep it unlocked and ` +
          `Safari foregrounded.\nUndo-history seam: ${seam ? 'available' : 'ABSENT (history table will be empty)'}`
      );
    } else if (freeDrawSeconds) {
      console.log(
        [
          '',
          '── Free-draw capture ────────────────────────────────────────────────',
          'On the iPad: tap the green START button in the banner, then draw however',
          `you like for ${freeDrawSeconds}s. Everything in that window is recorded —`,
          'the gaps between strokes and the finger-lifts included, which is where',
          'the stalls have been hiding.',
          '─────────────────────────────────────────────────────────────────────',
          '',
        ].join('\n')
      );
    } else {
      printHandInstructions(flag('phases') ?? 'all', contactSeconds);
    }

    const report = await waitForGlobal(session, 'window.__probeReport', {
      stalled: deviceConsole.errorText,
      timeoutMs: HAND_RUN_TIMEOUT_MS,
      timeoutHint: drive
        ? 'The synthetic hand never finished. Check that the tab stayed foregrounded.'
        : 'Nobody finished the phases. Draw until the banner says done, or call ' +
          '__probe.finish() in a Web Inspector console to publish what was banked.',
      progress: () => session.readJson('window.__probeProgress ?? null'),
    });

    await timeline?.stop(session);
    const counts = report.meta.counts;
    console.log(
      `\nReading back ${counts.frames} frames, ${counts.events} pointer events, ` +
        `${counts.measures} engine measures…`
    );
    report.frames = await readTable(session, 'frames', counts.frames);
    report.events = await readTable(session, 'events', counts.events);
    report.measures = await readTable(session, 'measures', counts.measures);
    await session.evaluate('window.__probe.stop()');

    const summaries = summarizeRun(report);
    console.log('\nFrame pacing (in-contact frames only)');
    console.table(pacingRows(summaries.phases));
    console.log('\nInput delivery and paint latency');
    console.table(inputRows(summaries.phases));
    console.log('\nEngine cost inside those frames, and the stroke-end hitch');
    console.table(engineRows(summaries.phases));
    console.log('\nTrusted-input render-starvation episodes');
    console.table(starvationRows(summaries.phases));
    const timelineSummary = timeline?.summary();
    if (timelineSummary) {
      console.log(
        '\nRendering records (counts only — the protocol zeroes every timestamp, so this ' +
          'says how much\nrendering work happened, never how long it took)'
      );
      console.table(timelineRows(timelineSummary, summaries.phases[0]?.pacing?.frames));
    }

    const comparisons = comparisonRows(summaries.phases);
    if (comparisons.length) {
      console.log('\nWhat each suppression bought (negative is better)');
      console.table(comparisons);
    }

    const outDir = profilePath('ipad-frames', device.deviceName.replace(/[^\w.-]+/g, '-'));
    mkdirSync(outDir, { recursive: true });
    const artifact = join(outDir, 'real-screen.json');
    writeFileSync(
      artifact,
      `${JSON.stringify(
        {
          device: { name: device.deviceName, os: device.deviceOSVersion, id: device.deviceId },
          appUrl,
          mode: drive ? `synthetic:${drive}${driveHz ? `@${driveHz}hz` : ''}` : 'hand',
          summaries,
          timeline: timelineSummary ?? null,
          report,
          console: deviceConsole.forReport(),
        },
        null,
        2
      )}\n`
    );
    console.log(`\nWrote ${artifact}`);
    return { summaries, report };
  } finally {
    session?.close();
    stopProxy();
    server?.stop();
  }
}

if (isMain(import.meta.url)) runMain(runIpadFrames);
