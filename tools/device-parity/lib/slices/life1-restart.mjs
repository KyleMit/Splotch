// LIFE-1: a process restart with choices changed and ink drawn, then a cold launch.
import { appFrame } from './step-primitives.mjs';

export const LAUNCH_WAIT_MS = 40_000;
const MENU_MS = 900;
const DIALOG_MS = 1200;

export async function relaunch(c) {
  await c.terminate();
  await c.sleep(MENU_MS);
  const t = await c.launch();
  await c.waitFor(() => c.findName(c.nameFor('Settings')), 'Settings', LAUNCH_WAIT_MS);
  return t;
}

async function closeDialog(c) {
  await c.tap('Close');
  await c.sleep(DIALOG_MS);
}

async function tapEach(c, names) {
  for (const name of names) {
    await c.tap(name);
    await c.sleep(MENU_MS);
  }
}

export const LIFE1_RESTART_STEPS = [
  {
    id: 'choices-and-ink',
    run: async (c) => {
      c.setPaper(appFrame(await c.nodes()));
      await tapEach(c, ['Black', 'Expand controls', 'Brushes', 'Crayon', 'Stroke width', 'Size 4']);
      return c.stroke(c.zigzag(0.45));
    },
  },
  {
    id: 'sound-off',
    run: async (c) => {
      await c.tap('Settings');
      await c.sleep(DIALOG_MS);
      return c.tap('Sound');
    },
    after: closeDialog,
  },
  { id: 'restart-first-frame', run: relaunch },
  { id: 'restart-settings', run: (c) => c.tap('Settings'), after: closeDialog },
  {
    id: 'restart-width-kept',
    run: async (c) => {
      if (!(await c.findName('Stroke width')).length) {
        await c.tap('Expand controls');
        await c.sleep(MENU_MS);
      }
      return c.tap('Stroke width');
    },
    after: async (c) => {
      await c.tap('Stroke width');
      await c.sleep(MENU_MS);
    },
  },
  {
    id: 'eraser-not-restored',
    setup: (c) => tapEach(c, ['Brushes', 'Eraser']),
    run: relaunch,
  },
  { id: 'cold-launch', run: relaunch },
];
