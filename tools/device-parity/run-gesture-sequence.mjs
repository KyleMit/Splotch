// A scripted gesture sequence with a timestamped line per step, for lining a run up against a
// profiler or a recording. --steps is a JSON list of steps:
//   ["scribble", n]  ["stroke"]  ["clear", "commit"|"cancel", hz, seconds, lo, hi]
//   ["wait", ms]     ["tap", name]  ["tapIf", name]
import { isMain, parseOrFail, runMain, sleep } from '../lib/proc.mjs';
import { createForegroundGuard } from './lib/app-foreground.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { parseFlags } from './lib/cli-flags.mjs';
import { clampToSafeArea, clearDragPoints, strokeChain, tapChain } from './lib/pointer-chains.mjs';

// [fewest, most] arguments each step takes.
const STEP_ARGS = {
  scribble: [1, 1],
  stroke: [0, 0],
  clear: [0, 5],
  wait: [1, 1],
  tap: [1, 1],
  tapIf: [1, 1],
};
const CLEAR_DEFAULTS = ['commit', 8, 2, 0.3, 2];
const TAP_HOLD_MS = 80;
const SCRIBBLE_POINTS = 30;
const STROKE_POINTS = 40;
const WAVE_PT = { scribble: 25, stroke: 40 };

const FLAGS = {
  session: { type: 'string' },
  bundle: { type: 'string' },
  steps: { type: 'string' },
};

export function parseStepList(text) {
  let steps;
  try {
    steps = JSON.parse(text);
  } catch (error) {
    throw new Error(`--steps is not JSON: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(steps)) throw new Error('--steps must be a JSON list of steps');
  for (const step of steps) {
    const [kind, ...args] = Array.isArray(step) ? step : [];
    const [fewest, most] = Object.hasOwn(STEP_ARGS, kind) ? STEP_ARGS[kind] : [];
    if (fewest === undefined || args.length < fewest || args.length > most) {
      throw new Error(`--steps has an unknown or malformed step ${JSON.stringify(step)}`);
    }
  }
  return steps;
}

export function parseGestureSequenceFlags(argv) {
  const { values } = parseFlags(argv, { options: FLAGS, required: ['session', 'bundle', 'steps'] });
  const steps = parseOrFail(() => parseStepList(values.steps));
  return { sessionFile: values.session, bundleId: values.bundle, steps };
}

const stamp = (...parts) => console.log(new Date().toISOString().slice(11, 23), ...parts);

export async function runGestureSequence({ sessionFile, bundleId, steps }) {
  const session = readSessionFile(sessionFile);
  const assertForeground = createForegroundGuard({ session, bundleId, onNote: stamp });
  const win = await session.windowRect();
  const safe = (point) => clampToSafeArea(win, point);
  let clearCenter = null;
  let n = 0;
  const findCenter = async (name) => {
    const [element] = await session.findAll('accessibility id', name);
    if (!element) return null;
    const r = await session.rect(element);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };

  for (const [kind, ...args] of steps) {
    if (kind === 'wait') {
      stamp('wait', args[0]);
      await sleep(args[0]);
      continue;
    }
    await assertForeground();
    if (kind === 'scribble') {
      stamp('scribble start', args[0]);
      for (let i = 0; i < args[0]; i += 1, n += 1) {
        const y = win.height * (0.28 + 0.44 * ((n * 0.37) % 1));
        const points = [];
        for (let k = 0; k <= SCRIBBLE_POINTS; k += 1) {
          const x = win.width * (0.15 + 0.1 * ((n * 0.53) % 1) + 0.5 * (k / SCRIBBLE_POINTS));
          points.push(safe({ x, y: y + WAVE_PT.scribble * Math.sin(k / 3 + n) }));
        }
        if (i > 0) await assertForeground();
        await session.actions([strokeChain(`ink${n}`, points)]);
      }
      stamp('scribble end');
    } else if (kind === 'stroke') {
      stamp('stroke');
      const points = [];
      for (let k = 0; k <= STROKE_POINTS; k += 1) {
        const x = win.width * (0.3 + 0.3 * (k / STROKE_POINTS));
        points.push(safe({ x, y: win.height * 0.5 + WAVE_PT.stroke * Math.sin(k / 4) }));
      }
      await session.actions([strokeChain(`st${n++}`, points)]);
      stamp('stroke end');
    } else if (kind === 'clear') {
      const [release, hz, seconds, lo, hi] = CLEAR_DEFAULTS.map(
        (fallback, i) => args[i] ?? fallback
      );
      clearCenter ??= await findCenter('Clear drawing');
      if (!clearCenter) throw new Error('no Clear drawing');
      const finalFraction = release === 'commit' ? Math.max(hi, 1.2) : 0.3;
      const drag = { win, center: clearCenter, hz, seconds, lo, hi, finalFraction };
      const points = clearDragPoints(drag).points.map((p, i) => (i === 0 ? p : safe(p)));
      stamp('clear start', release, hz, seconds);
      await session.actions([strokeChain(`clr${n++}`, points)]);
      stamp('clear released');
    } else {
      const center = await findCenter(args[0]);
      if (!center && kind === 'tap') throw new Error(`no ${args[0]}`);
      stamp(kind, args[0], Boolean(center));
      if (center) await session.actions([tapChain(`tap${n++}`, center, { holdMs: TAP_HOLD_MS })]);
    }
  }
  stamp('done');
}

if (isMain(import.meta.url)) {
  runMain(() => runGestureSequence(parseGestureSequenceFlags(process.argv.slice(2))));
}
