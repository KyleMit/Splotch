// SAVE-1 (iOS simulator): Save Picture, a burst of taps, saving while drawing, and the failure
// banner once Photos access is revoked.
import { LAUNCH_WAIT_MS } from './life1-restart.mjs';
import { appFrame } from './step-primitives.mjs';

const MENU_MS = 900;
const SETTLE_MS = 1500;
const BURST_GAP_MS = 150;

// A Photos privacy change terminates the app, so it relaunches after each grant or revoke.
async function relaunchAfterPrivacy(c, action) {
  c.privacy(action);
  await c.sleep(SETTLE_MS);
  await c.launch();
  await c.waitFor(() => c.findName(c.nameFor('Settings')), 'Settings', LAUNCH_WAIT_MS);
}

export const SAVE1_PICTURE_STEPS = [
  {
    id: 'save-picture',
    setup: async (c) => {
      await relaunchAfterPrivacy(c, 'grant');
      await c.sleep(SETTLE_MS);
      c.setPaper(appFrame(await c.nodes()));
      await c.tap('Expand controls');
      await c.sleep(MENU_MS);
      await c.stroke(c.zigzag(0.45));
      await c.sleep(SETTLE_MS);
    },
    run: (c) => c.tap('Save screenshot'),
  },
  {
    id: 'save-burst',
    setup: (c) => c.sleep(SETTLE_MS * 2),
    run: (c) => c.multiTap('Save screenshot', 3, BURST_GAP_MS),
  },
  {
    id: 'save-while-drawing',
    setup: (c) => c.sleep(SETTLE_MS * 2),
    run: async (c) => {
      await c.tap('Save screenshot');
      return c.stroke(c.zigzag(0.62));
    },
  },
  {
    id: 'save-denied',
    setup: async (c) => {
      await c.sleep(SETTLE_MS * 2);
      await relaunchAfterPrivacy(c, 'revoke');
      if (!(await c.findName('Save screenshot')).length) {
        await c.tap('Expand controls');
        await c.sleep(MENU_MS);
      }
      await c.stroke(c.zigzag(0.45));
      await c.sleep(SETTLE_MS);
    },
    run: (c) => c.tap('Save screenshot'),
  },
];
