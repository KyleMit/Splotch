// LIFE-1 Android Back: Back on a dialog, a Settings section, ink, the leave dialog, and a blank
// page. The only slice that sends Back, because Back is what it measures; its last step records
// which app is in front afterwards.
import { relaunch } from './life1-restart.mjs';
import { setPaperFromWindow } from './step-primitives.mjs';

const DIALOG_MS = 1200;

export const LIFE1_ANDROID_BACK_STEPS = [
  {
    id: 'back-closes-settings',
    setup: setPaperFromWindow,
    run: async (c) => {
      await c.tap('Settings');
      await c.sleep(DIALOG_MS);
      return c.back();
    },
  },
  {
    id: 'back-closes-section',
    run: async (c) => {
      await c.tap('Settings');
      await c.sleep(DIALOG_MS);
      await c.tap('Tool Drawer card');
      await c.sleep(DIALOG_MS);
      return c.back();
    },
  },
  {
    id: 'back-with-ink',
    setup: async (c) => {
      await c.stroke(c.zigzag(0.45));
      await c.sleep(DIALOG_MS);
    },
    run: (c) => c.back(),
  },
  { id: 'back-closes-leave-dialog', run: (c) => c.back() },
  {
    id: 'back-on-blank-page',
    setup: relaunch,
    run: (c) => c.back(),
    after: (c) => c.note(`foreground after Back: ${c.foregroundPackage()}`),
  },
];
