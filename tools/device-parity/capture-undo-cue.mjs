// Records a video of Undo pressed at the end of history, the moment the app's unavailable cue
// plays. iOS simulator or Android: the recording runs through simctl or screenrecord.
import { isMain, runMain, sleep } from '../lib/proc.mjs';
import { createForegroundGuard } from './lib/app-foreground.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { parseFlags } from './lib/cli-flags.mjs';
import { strokeChain, tapChain } from './lib/pointer-chains.mjs';
import { startScreenRecording } from './lib/screen-recording.mjs';

const TAP_HOLD_MS = 50;
const DRAWER_SETTLE_MS = 800;
const INK_SETTLE_MS = 1500;
const UNDO_SETTLE_MS = 700;
const UNDO_PRESSES_MAX = 40;
const RECORD_LEAD_MS = 1500;
const CUE_TAIL_MS = 2000;
const INK_POINTS = 20;
const INK_WAVE_PT = 30;

const FLAGS = { session: { type: 'string' }, bundle: { type: 'string' }, out: { type: 'string' } };

export function parseUndoCueFlags(argv) {
  const { values } = parseFlags(argv, { options: FLAGS, required: ['session', 'bundle', 'out'] });
  return { sessionFile: values.session, bundleId: values.bundle, out: values.out };
}

export async function captureUndoCue({ sessionFile, bundleId, out }) {
  const session = readSessionFile(sessionFile);
  const assertForeground = createForegroundGuard({ session, bundleId, onNote: console.log });
  await assertForeground();
  const win = await session.windowRect();
  const find = async (name) => (await session.findAll('accessibility id', name))[0] ?? null;
  const tap = async (name) => {
    const element = await find(name);
    if (!element) throw new Error(`no ${name}`);
    const r = await session.rect(element);
    await assertForeground();
    const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    await session.actions([tapChain('t', center, { holdMs: TAP_HOLD_MS })]);
    return r;
  };
  if (!(await find('Undo'))) {
    await tap('Expand controls');
    await sleep(DRAWER_SETTLE_MS);
  }
  const y = win.height * 0.4;
  const ink = [
    { x: win.width * 0.35, y },
    ...Array.from({ length: INK_POINTS }, (_, k) => ({
      x: win.width * (0.35 + k * 0.012),
      y: y + INK_WAVE_PT * Math.sin(k / 3),
    })),
  ];
  await assertForeground();
  await session.actions([strokeChain('d', ink)]);
  await sleep(INK_SETTLE_MS);
  // Undo down to the end of history, whatever the app restored at launch.
  for (let press = 0; press < UNDO_PRESSES_MAX; press += 1) {
    if (!(await session.enabled(await find('Undo')))) break;
    await tap('Undo');
    await sleep(UNDO_SETTLE_MS);
  }
  await sleep(DRAWER_SETTLE_MS);
  const recording = await startScreenRecording({
    platform: session.platform,
    device: session.device,
    file: out,
  });
  await sleep(RECORD_LEAD_MS);
  const undo = await tap('Undo');
  await sleep(CUE_TAIL_MS);
  await recording.stop();
  console.log(JSON.stringify({ undo, window: win, video: out }));
}

if (isMain(import.meta.url)) {
  runMain(() => captureUndoCue(parseUndoCueFlags(process.argv.slice(2))));
}
