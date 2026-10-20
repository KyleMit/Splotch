// Drives "Clear drawing" with a scripted drag that oscillates across the accept threshold, samples
// the app's footprint throughout, and ends with a machine-readable verdict.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NON_NEGATIVE_INTEGER,
  POSITIVE_INTEGER,
  POSITIVE_NUMBER,
  fail,
  isMain,
  runMain,
  sleep,
} from '../lib/proc.mjs';
import { createForegroundGuard, queryAppState } from './lib/app-foreground.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { choiceFlag, numberFlag, parseFlags } from './lib/cli-flags.mjs';
import {
  CRASH_TARGETS,
  CRASH_TARGET_NAMES,
  assertSessionMatchesTarget,
} from './lib/crash-targets.mjs';
import {
  androidNow,
  androidPssMb,
  androidVerdict,
  hostFootprintMb,
  ipadCrashList,
  ipadExitRecords,
  ipadNewReports,
  ipadVerdict,
  simAppPid,
  simVerdict,
} from './lib/crash-verdict.mjs';
import {
  MOVE_STEP_MS,
  clampToSafeArea,
  clearDragPoints,
  strokeChain,
} from './lib/pointer-chains.mjs';

const SAMPLE_EVERY_MS = 250;
const REGRAB_POINTS = 40;
const REGRAB_STEP_MS = 8;
const EXTRA_FINGER_OFFSET_PT = { x: 6, y: 4 };
const EXTRA_FINGER_DRIFT_FRACTION = 0.3;
const ACTION_ERROR_CHARS = 400;
const INK_POINTS = 30;
const INK_WAVE_PT = 25;

const FLAGS = {
  session: { type: 'string' },
  target: { type: 'string' },
  bundle: { type: 'string' },
  'process-name': { type: 'string' },
  out: { type: 'string' },
  label: { type: 'string', default: 'run' },
  lo: { type: 'string', default: '0.6' },
  hi: { type: 'string', default: '1.4' },
  hz: { type: 'string', default: '6' },
  seconds: { type: 'string', default: '15' },
  release: { type: 'string', default: 'commit' },
  ink: { type: 'string', default: '6' },
  fingers: { type: 'string', default: '1' },
  regrab: { type: 'string', default: '0' },
  settle: { type: 'string', default: '12' },
  'clear-name': { type: 'string', default: 'Clear drawing' },
  'collect-log': { type: 'boolean', default: false },
};

export function parseClearDragFlags(argv) {
  const { values } = parseFlags(argv, {
    options: FLAGS,
    required: ['session', 'target', 'bundle', 'out'],
  });
  const target = choiceFlag(values, 'target', CRASH_TARGET_NAMES);
  if (CRASH_TARGETS[target].platform === 'ios' && !values['process-name']) {
    fail(`--target=${target} needs --process-name=<the app's iOS process name>`);
  }
  if (values['collect-log'] && target !== 'ios-device') {
    fail('--collect-log reads a physical iPad’s unified log; it applies to --target=ios-device');
  }
  const number = (name) => numberFlag(values, name, POSITIVE_NUMBER);
  return {
    sessionFile: values.session,
    target,
    bundleId: values.bundle,
    processName: values['process-name'],
    out: values.out,
    label: values.label,
    lo: numberFlag(values, 'lo', { min: 0 }),
    hi: number('hi'),
    hz: number('hz'),
    seconds: number('seconds'),
    release: choiceFlag(values, 'release', ['commit', 'cancel']),
    ink: numberFlag(values, 'ink', NON_NEGATIVE_INTEGER),
    fingers: numberFlag(values, 'fingers', POSITIVE_INTEGER),
    regrab: numberFlag(values, 'regrab', NON_NEGATIVE_INTEGER),
    settleSeconds: number('settle'),
    clearName: values['clear-name'],
    collectLog: values['collect-log'],
  };
}

function footprintSampler(options, device) {
  if (options.target === 'ios-device') return () => null;
  if (options.target === 'ios-simulator') {
    return () => hostFootprintMb(simAppPid(device, options.bundleId).pid);
  }
  return () => androidPssMb(device, options.bundleId);
}

function inkStrokes(win, count) {
  const strokes = [];
  for (let i = 0; i < count; i += 1) {
    const y = win.height * (0.28 + 0.44 * ((i * 0.37) % 1));
    const x0 = 0.15 + 0.1 * ((i * 0.53) % 1);
    const points = [];
    for (let k = 0; k <= INK_POINTS; k += 1) {
      const point = {
        x: win.width * (x0 + 0.5 * (k / INK_POINTS)),
        y: y + INK_WAVE_PT * Math.sin(k / 3 + i),
      };
      points.push(clampToSafeArea(win, point));
    }
    strokes.push(points);
  }
  return strokes;
}

// Extra fingers press Clear alongside and drift a little; the gesture belongs to the first finger.
function extraFingerChains({ center, direction, radius, count, seconds }) {
  const chains = [];
  const steps = Math.round((seconds * 1000) / MOVE_STEP_MS);
  for (let finger = 1; finger < count; finger += 1) {
    const start = {
      x: center.x + EXTRA_FINGER_OFFSET_PT.x * finger,
      y: center.y + EXTRA_FINGER_OFFSET_PT.y * finger,
    };
    const points = [start];
    for (let k = 1; k <= steps; k += 1) {
      const drift = radius * EXTRA_FINGER_DRIFT_FRACTION * Math.sin(k / 9);
      points.push({ x: start.x + direction.x * drift, y: start.y + direction.y * drift });
    }
    chains.push(strokeChain(`clear${finger}`, points));
  }
  return chains;
}

async function stressVerdict({ session, options, source, startMs, startStamp, before }) {
  if (options.target === 'ios-simulator') {
    return simVerdict({
      udid: session.device,
      bundleId: options.bundleId,
      processName: options.processName,
      sinceMs: startMs,
      source,
    });
  }
  if (options.target !== 'ios-device') {
    const serial = session.device;
    return androidVerdict({ serial, pkg: options.bundleId, startStamp, sinceMs: startMs, source });
  }
  const appState = await queryAppState(session, options.bundleId).catch(
    (error) => `query failed: ${String(error.message).slice(0, ACTION_ERROR_CHARS)}`
  );
  const newReports = ipadNewReports(session.device, before, options.processName);
  const verdict = ipadVerdict({ appState, newReports, source });
  if (!options.collectLog) return verdict;
  const archive = join(options.out, `${options.label}.logarchive`);
  const udid = session.device;
  const records = ipadExitRecords({
    udid,
    bundleId: options.bundleId,
    archive,
    startMs,
    endMs: Date.now(),
  });
  return { ...verdict, exitRecords: records };
}

export async function runClearDragStress(options) {
  const session = readSessionFile(options.sessionFile);
  assertSessionMatchesTarget(session, options.target);
  mkdirSync(options.out, { recursive: true });
  const notes = [];
  const assertForeground = createForegroundGuard({
    session,
    bundleId: options.bundleId,
    onNote: (text) => notes.includes(text) || notes.push(text),
  });
  await assertForeground();
  const win = await session.windowRect();
  const [clear] = await session.findAll('accessibility id', options.clearName);
  if (!clear) throw new Error(`no ${options.clearName} control`);
  const r = await session.rect(clear);
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  for (const [index, points] of inkStrokes(win, options.ink).entries()) {
    await assertForeground();
    await session.actions([strokeChain(`ink${index}`, points)]);
  }

  const finalFraction =
    options.release === 'commit' ? Math.max(options.hi, 1.2) : Math.min(options.lo, 0.5);
  const drag = {
    win,
    center,
    hz: options.hz,
    seconds: options.seconds,
    lo: options.lo,
    hi: options.hi,
  };
  const { points, radius, direction } = clearDragPoints({ ...drag, finalFraction });
  const clamped = points.map((point, index) => (index === 0 ? point : clampToSafeArea(win, point)));
  const chains = [
    strokeChain('clear', clamped),
    ...extraFingerChains({
      center,
      direction,
      radius,
      count: options.fingers,
      seconds: options.seconds,
    }),
  ];

  const footprint = footprintSampler(options, session.device);
  const startMs = Date.now();
  const before = options.target === 'ios-device' ? ipadCrashList(session.device) : null;
  const startStamp = session.platform === 'android' ? androidNow(session.device) : null;
  const samples = [{ t: 0, mb: footprint() }];
  const sampler = setInterval(
    () => samples.push({ t: Date.now() - startMs, mb: footprint() }),
    SAMPLE_EVERY_MS
  );
  await assertForeground();
  let actionError = null;
  try {
    await session.actions(chains);
  } catch (error) {
    actionError = String(error.message).slice(0, ACTION_ERROR_CHARS);
  }
  const releasedAt = Date.now() - startMs;
  // Re-grabs while the lift and return motion is still running.
  for (let grab = 0; grab < options.regrab; grab += 1) {
    const regrab = clamped.slice(0, REGRAB_POINTS);
    await session.actions([strokeChain(`regrab${grab}`, regrab, REGRAB_STEP_MS)]).catch(() => {});
  }
  await sleep(options.settleSeconds * 1000);
  clearInterval(sampler);
  const source = await session.source().catch(() => '');
  const verdict = await stressVerdict({ session, options, source, startMs, startStamp, before });
  const footprints = samples.map((sample) => sample.mb).filter((mb) => mb !== null);
  const result = {
    label: options.label,
    target: options.target,
    params: {
      lo: options.lo,
      hi: options.hi,
      hz: options.hz,
      seconds: options.seconds,
      release: options.release,
      fingers: options.fingers,
      regrab: options.regrab,
      ink: options.ink,
    },
    radius,
    releasedAt,
    actionError,
    notes,
    startMb: footprints[0] ?? null,
    peakMb: footprints.length ? Math.max(...footprints) : null,
    endMb: footprints.at(-1) ?? null,
    ...verdict,
    samples,
  };
  writeFileSync(join(options.out, `${options.label}.json`), JSON.stringify(result, null, 2));
  const { startMb, peakMb, endMb, errorScreen } = result;
  const summary = { verdict: result.verdict, startMb, peakMb, endMb, actionError, errorScreen };
  console.log(new Date().toISOString().slice(11, 23), options.label, JSON.stringify(summary));
  return result;
}

if (isMain(import.meta.url)) {
  runMain(() => runClearDragStress(parseClearDragFlags(process.argv.slice(2))));
}
