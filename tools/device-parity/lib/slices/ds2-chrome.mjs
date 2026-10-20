// DS-2: drawing-screen chrome interaction and motion. Each run() returns the time of its last
// input; setup and after are unrecorded. Keys are shipping accessible names; an arm's aliases map
// them where its names differ.
import { appFrame, setPaperFromWindow } from './step-primitives.mjs';

const SHORT_TAP_GAP_MS = 120;
const CLEAR_DRAG_MS = 600;
const CLEAR_DRAG_FRACTION = 0.36;
const MENU_MS = 900;
const DIALOG_MS = 1200;
const SCRIM_REACH_PT = 60;
const SCRIM_BOTTOM_MARGIN_PT = 40;
const HEX_CARD_INSET_PT = 16;

// The picker card's frame: RN names it; the WebView reference exposes only its hexagons.
async function scrimPoint(c) {
  const nodes = await c.nodes();
  const card = nodes.find((node) => node.name === 'color-picker-card');
  const hex = nodes.filter((node) => /^#[0-9A-F]{6}$/i.test(node.name));
  const w = appFrame(nodes);
  let top;
  if (card) top = card.frame.y + card.frame.h;
  else if (hex.length) top = Math.max(...hex.map((h) => h.frame.y + h.frame.h)) + HEX_CARD_INSET_PT;
  else throw new Error('picker not found');
  return [w.x + w.w / 2, Math.min(top + SCRIM_REACH_PT, w.y + w.h - SCRIM_BOTTOM_MARGIN_PT)];
}

async function closeByScrim(c) {
  const [x, y] = await scrimPoint(c);
  await c.tapPoint(x, y, 'picker scrim');
  await c.sleep(DIALOG_MS);
}

async function closeDialog(c) {
  await c.tap('Close');
  await c.sleep(DIALOG_MS);
}

export const DS2_CHROME_STEPS = [
  { id: 'drawer-open', setup: setPaperFromWindow, run: (c) => c.tap('Expand controls') },
  { id: 'brush-menu-open', run: (c) => c.tap('Brushes') },
  { id: 'brush-pick-crayon', run: (c) => c.tap('Crayon') },
  {
    id: 'brush-back-to-pen',
    run: async (c) => {
      await c.tap('Brushes');
      await c.sleep(MENU_MS);
      return c.tap('Pen');
    },
  },
  { id: 'width-menu-open', run: (c) => c.tap('Stroke width') },
  { id: 'width-pick-size5', run: (c) => c.tap('Size 5') },
  {
    id: 'eraser-width-pick',
    setup: async (c) => {
      await c.tap('Brushes');
      await c.sleep(MENU_MS);
      await c.tap('Eraser');
      await c.sleep(DIALOG_MS);
    },
    run: async (c) => {
      await c.tap('Stroke width');
      await c.sleep(MENU_MS);
      return c.tap('Eraser size 2');
    },
  },
  { id: 'color-while-erasing', run: (c) => c.tap('Purple') },
  {
    id: 'pen-width-kept',
    run: (c) => c.tap('Stroke width'),
    after: async (c) => {
      await c.tap('Stroke width');
      await c.sleep(1000);
    },
  },
  { id: 'swatch-pick-black', run: (c) => c.tap('Black') },
  { id: 'custom-open', run: (c) => c.tap('Custom Color') },
  {
    id: 'custom-scrim-close',
    run: async (c) => {
      const [x, y] = await scrimPoint(c);
      return c.tapPoint(x, y, 'picker scrim');
    },
  },
  {
    id: 'custom-double-tap',
    run: (c) => c.multiTap('Custom Color', 2, SHORT_TAP_GAP_MS),
    after: closeByScrim,
  },
  {
    id: 'settings-double-tap',
    run: (c) => c.multiTap('Settings', 2, SHORT_TAP_GAP_MS),
    after: closeDialog,
  },
  {
    id: 'books-double-tap',
    run: (c) => c.multiTap('Coloring books', 2, SHORT_TAP_GAP_MS),
    after: closeDialog,
  },
  { id: 'draw-zigzag', run: (c) => c.stroke(c.zigzag(0.45)) },
  { id: 'undo-ghost', run: (c) => c.tap('Undo') },
  { id: 'undo-unavailable', run: (c) => c.tap('Undo') },
  {
    id: 'clear-drag',
    setup: async (c) => {
      await c.stroke(c.zigzag(0.45));
      await c.sleep(DIALOG_MS);
    },
    run: async (c) => {
      const short = Math.min(c.paper.w, c.paper.h);
      const reach = short * CLEAR_DRAG_FRACTION;
      return c.drag('Clear drawing', -reach, reach, CLEAR_DRAG_MS);
    },
  },
  { id: 'undo-after-clear', run: (c) => c.tap('Undo') },
  { id: 'clear-coachmark', run: (c) => c.multiTap('Clear drawing', 3, SHORT_TAP_GAP_MS) },
  {
    id: 'menu-dismissed-by-drawing',
    setup: (c) => c.sleep(1500),
    run: async (c) => {
      await c.tap('Brushes');
      await c.sleep(MENU_MS);
      return c.stroke(c.zigzag(0.6));
    },
  },
  { id: 'drawer-collapse', run: (c) => c.tap('Collapse controls') },
];
