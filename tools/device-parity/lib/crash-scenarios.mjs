// Crash-hunt stress scenarios, pre-registered on issue 2978. Each takes a scenario driver and runs
// one scenario to completion; the runner owns the verdict.
import { shortError } from './scenario-driver.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HELD_CLEAR_SETTLE_MS = 800;
const MENU_SETTLE_MS = 1000;
const CLEAR_SETTLE_MS = 1500;
const RELAUNCH_SETTLE_MS = 2500;
const S4_CYCLES = { virtual: 3, physical: 2 };
const S5_STROKES = { virtual: 2000, physical: 300 };
const S5_BATCH = 25;
const S5_SAMPLE_EVERY = 50;
const S5_CLEAR_EVERY = 250;
const S3_TAPS = 120;
const LEAK_ROUNDS = 5;

const S3_CONTROL_NAMES = [
  'Purple',
  'Blue',
  'Teal',
  'Green',
  'Yellow',
  'Orange',
  'Red',
  'Pink',
  'Black',
  'Custom Color',
  'Expand controls',
  'Collapse controls',
  'Brushes',
  'Pen',
  'Crayon',
  'Magic brush',
  'Eraser',
  'Stroke width',
  'Undo',
  'Clear drawing',
  'Coloring books',
  'Colors',
  'More colors',
];
const S2_BRUSHES = ['Pen', 'Crayon', 'Magic brush', 'Eraser'];
const S2_UNDO_AT = new Set([8, 20, 28, 36]);
const S2_CLEAR_AT = new Set([12, 32]);
const QUICK_CLEAR = { hz: 2, seconds: 0.6, lo: 0.4, hi: 1.5 };

const scale = (d, counts) => (d.physical ? counts.physical : counts.virtual);

// Background and resume mid-stroke, rotate mid-drag, then open Settings with a second finger
// mid-stroke.
async function lifecycleCycle(d, cycle) {
  await d.assertForeground();
  const long = d.session
    .actions([d.chain('bg', [{ points: d.scribble(120), step: 16 }])])
    .catch((error) => d.note(`bg stroke: ${shortError(error)}`));
  await sleep(600);
  await d.sendHome();
  await long;
  await sleep(CLEAR_SETTLE_MS);
  if (d.target === 'android-emulator') {
    try {
      d.trimMemory('COMPLETE');
      d.note('trim-memory COMPLETE sent while backgrounded');
    } catch (error) {
      d.note(`trim-memory refused: ${String(error.stderr ?? error.message).slice(-120)}`);
    }
  }
  await d.bringBack();
  await sleep(RELAUNCH_SETTLE_MS);
  await d.assertForeground();
  const drag = d.session
    .actions([d.chain('rot', [{ points: d.scribble(100), step: 16 }])])
    .catch((error) => d.note(`rot stroke: ${shortError(error)}`));
  await sleep(500);
  await d.session
    .setOrientation(cycle % 2 ? 'LANDSCAPE' : 'PORTRAIT')
    .catch((error) => d.note(`orientation: ${shortError(error)}`));
  await drag;
  await sleep(2000);
  await d.refreshWindow();
  const settings = await d.find('Settings');
  if (!settings) return;
  const r = await d.session.rect(settings);
  await d.assertForeground();
  await d.session
    .actions([
      d.chain('draw', [{ points: d.scribble(60), step: 16 }]),
      d.chain('set', [
        { pause: 300 },
        { points: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }], raw: true },
      ]),
    ])
    .catch((error) => d.note(`settings: ${shortError(error)}`));
  await sleep(RELAUNCH_SETTLE_MS);
  await d.tapName('Close', false);
  await sleep(MENU_SETTLE_MS);
}

export const CRASH_SCENARIOS = {
  async S1(d) {
    // A tap ends a Clear hold a previous run may have left pressed (issue 3037).
    await d.tapName('Clear drawing', false);
    await sleep(HELD_CLEAR_SETTLE_MS);
    await d.chooseBrush('Crayon');
    await d.strokes(12, 16);
    await sleep(MENU_SETTLE_MS);
    d.shot('before-clear');
    await d.clearDrag({ hz: 6, seconds: 3, lo: 0.3, hi: 1.8, release: 'commit' });
    await sleep(10_000);
  },
  async S2(d) {
    await d.tapName('Clear drawing', false);
    await d.openFirstPage();
    for (let i = 0; i < 40; i += 4) {
      await d.chooseBrush(S2_BRUSHES[(i / 4) % S2_BRUSHES.length]);
      for (let k = 0; k < 4; k += 1) {
        const points = 10 + Math.floor(d.random() * 20);
        await d.strokes(1, points, 1 + Math.floor(d.random() * d.maxFingers));
      }
      if (S2_UNDO_AT.has(i)) await d.tapName('Undo', false);
      if (S2_CLEAR_AT.has(i)) {
        await d.clearDrag({ hz: 4, seconds: 1, lo: 0.4, hi: 1.6 });
        await sleep(CLEAR_SETTLE_MS);
      }
    }
    await sleep(5000);
  },
  async S3(d) {
    for (let i = 0; i < S3_TAPS; i += 1) {
      const name = S3_CONTROL_NAMES[Math.floor(d.random() * S3_CONTROL_NAMES.length)];
      try {
        await d.tapName(name, false);
      } catch (error) {
        d.note(`tap ${name}: ${shortError(error)}`);
        if (String(error.message).startsWith('foreground')) throw error;
      }
    }
    await sleep(4000);
  },
  async S4(d) {
    const startOrientation = await d.session.orientation().catch(() => 'PORTRAIT');
    for (let cycle = 0; cycle < scale(d, S4_CYCLES); cycle += 1) await lifecycleCycle(d, cycle);
    await d.session.setOrientation(startOrientation).catch(() => {});
    await sleep(3000);
  },
  async S5(d, { strokes }) {
    const total = strokes ?? scale(d, S5_STROKES);
    const memory = [];
    for (let drawn = 0; drawn < total; drawn += S5_BATCH) {
      const done = drawn + S5_BATCH;
      await d.strokes(S5_BATCH, 8);
      if (done % S5_SAMPLE_EVERY === 0) memory.push({ strokes: done, mem: d.heapMb() });
      if (done % S5_CLEAR_EVERY === 0) {
        await d.clearDrag(QUICK_CLEAR);
        await sleep(2000);
        memory.push({ afterClear: done, mem: d.heapMb() });
      }
    }
    d.note(`memory: ${JSON.stringify(memory)}`);
    await sleep(4000);
  },
  async LEAK(d) {
    const series = [];
    await d.tapName('Clear drawing', false);
    await d.chooseBrush('Crayon');
    series.push({ step: 'start', mem: d.heapMb() });
    for (let i = 1; i <= LEAK_ROUNDS; i += 1) {
      await d.strokes(12, 16);
      await sleep(CLEAR_SETTLE_MS);
      series.push({ step: `crayon x12 #${i}`, mem: d.heapMb() });
    }
    for (let i = 1; i <= LEAK_ROUNDS; i += 1) {
      await d.strokes(1, 16);
      await sleep(500);
      await d.clearDrag(QUICK_CLEAR);
      await sleep(3000);
      series.push({ step: `clear #${i}`, mem: d.heapMb() });
    }
    await d.chooseBrush('Pen');
    for (let i = 1; i <= LEAK_ROUNDS; i += 1) {
      await d.strokes(12, 16);
      await sleep(CLEAR_SETTLE_MS);
      series.push({ step: `pen x12 #${i}`, mem: d.heapMb() });
    }
    d.note(`series: ${JSON.stringify(series)}`);
  },
  async S6(d) {
    await d.tapName('Clear drawing', false);
    await d.strokes(4, 14);
    const center = await d.clearCenter();
    await d.assertForeground();
    await d.session.actions([
      d.chain('draw', [{ points: d.scribble(160), step: 16 }]),
      d.chain('clear', [
        { pause: 400 },
        d.clearSegment(center, { hz: 5, seconds: 1.5, lo: 0.3, hi: 1.7 }),
      ]),
    ]);
    await sleep(8000);
  },
};

export const CRASH_SCENARIO_NAMES = Object.keys(CRASH_SCENARIOS);
