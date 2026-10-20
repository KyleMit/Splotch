// Taps one named control repeatedly and reports how long Appium took to play the taps back.
// --mode=burst sends every tap in one chain (a double or triple tap); --mode=separate sends each tap
// as its own /actions call, which is how a slow WDA playback shows up as per-tap time.
import { NON_NEGATIVE_INTEGER, POSITIVE_INTEGER, isMain, runMain, sleep } from '../lib/proc.mjs';
import { createForegroundGuard } from './lib/app-foreground.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { choiceFlag, numberFlag, parseFlags } from './lib/cli-flags.mjs';
import { writeScreenshot } from './lib/device-commands.mjs';
import { tapChain } from './lib/pointer-chains.mjs';

const FLAGS = {
  session: { type: 'string' },
  bundle: { type: 'string' },
  name: { type: 'string' },
  mode: { type: 'string', default: 'burst' },
  count: { type: 'string', default: '2' },
  'hold-ms': { type: 'string', default: '40' },
  'gap-ms': { type: 'string', default: '120' },
  'wait-ms': { type: 'string', default: '700' },
  shot: { type: 'string' },
};

export function parseTapProbeFlags(argv) {
  const { values } = parseFlags(argv, { options: FLAGS, required: ['session', 'bundle', 'name'] });
  return {
    sessionFile: values.session,
    bundleId: values.bundle,
    name: values.name,
    mode: choiceFlag(values, 'mode', ['burst', 'separate']),
    count: numberFlag(values, 'count', POSITIVE_INTEGER),
    holdMs: numberFlag(values, 'hold-ms', NON_NEGATIVE_INTEGER),
    gapMs: numberFlag(values, 'gap-ms', NON_NEGATIVE_INTEGER),
    waitMs: numberFlag(values, 'wait-ms', NON_NEGATIVE_INTEGER),
    shot: values.shot,
  };
}

export async function runTapProbe(options) {
  const session = readSessionFile(options.sessionFile);
  const assertForeground = createForegroundGuard({
    session,
    bundleId: options.bundleId,
    onNote: console.log,
  });
  const [element] = await session.findAll('accessibility id', options.name);
  if (!element) throw new Error(`no ${options.name}`);
  const r = await session.rect(element);
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  const timings = [];
  if (options.mode === 'burst') {
    await assertForeground();
    const startedAt = Date.now();
    const { count, holdMs, gapMs } = options;
    await session.actions([tapChain('f', center, { count, holdMs, gapMs })]);
    timings.push(Date.now() - startedAt);
  } else {
    for (let index = 0; index < options.count; index += 1) {
      await assertForeground();
      const startedAt = Date.now();
      await session.actions([tapChain(`t${index}`, center, { holdMs: options.holdMs })]);
      timings.push(Date.now() - startedAt);
      await sleep(options.gapMs);
    }
  }
  console.log(JSON.stringify({ mode: options.mode, control: options.name, actionsMs: timings }));
  if (options.shot) {
    await sleep(options.waitMs);
    writeScreenshot(session.platform, session.device, options.shot);
  }
  return timings;
}

if (isMain(import.meta.url)) {
  runMain(() => runTapProbe(parseTapProbeFlags(process.argv.slice(2))));
}
