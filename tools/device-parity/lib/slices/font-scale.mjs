// Issue 2985 font-scale subcase: the surfaces the issue names, captured at the OS font scale the
// batch runs under (set before launch). Each step only opens a surface; the capture is the evidence.
import { SCROLL_UP, closeIfOpen, setPaperFromWindow, tapLabel } from './step-primitives.mjs';

const SETTLE_MS = 1500;
const CLOSE_PASSES = 2;

async function closeAll(c) {
  await closeIfOpen(c, CLOSE_PASSES);
}

async function openSettings(c) {
  await closeAll(c);
  await c.tap('Settings');
  await c.sleep(SETTLE_MS);
}

export const FONT_SCALE_STEPS = [
  { id: 'drawing-screen', setup: setPaperFromWindow, run: (c) => c.tap('Expand controls') },
  { id: 'settings-hub', run: (c) => c.tap('Settings') },
  {
    id: 'settings-hub-scrolled',
    run: async (c) => {
      await c.stroke(SCROLL_UP);
      return Date.now();
    },
  },
  {
    id: 'appearance',
    setup: openSettings,
    run: (c) => tapLabel(c, 'Appearance', { bothWays: true }),
  },
  { id: 'coloring-library', setup: closeAll, run: (c) => c.tap('Coloring books') },
  {
    id: 'grown-up-check',
    setup: openSettings,
    run: async (c) => {
      const t = await tapLabel(c, 'Parent Center', { bothWays: true });
      await c.sleep(SETTLE_MS);
      if ((await c.findName('Unlock these settings')).length) return c.tap('Unlock these settings');
      return t;
    },
  },
];
