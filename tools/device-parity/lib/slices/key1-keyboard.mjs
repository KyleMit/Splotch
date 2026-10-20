// KEY-1: hardware Cmd+Z on the drawing screen and in a dialog text field, Escape on flyouts, the
// picker and Settings, and grown-up check digits with Backspace and Return. On iOS, Cmd+Z goes
// through XCUITest's typeKey; Delete, Escape, and Return need raw HID usages.
import {
  appFrame,
  closeIfOpen,
  setPaperFromWindow,
  tapLabel,
  visible,
} from './step-primitives.mjs';

const XCUI_COMMAND = 1 << 4;
const HID_RETURN = 0x28;
const HID_ESCAPE = 0x29;
const HID_BACKSPACE = 0x2a;
const MENU_MS = 900;
const SETTLE_MS = 1500;
const KEY_GAP_MS = 400;
const SCRIM_BELOW_PICKER_PT = 80;
const SCRIM_BOTTOM_MARGIN_PT = 60;
const TYPED_TEXT = 'hello splotch';
const GATE_PROBLEM = /(\d+)\s*(times|plus|minus|×|\+|−|-)\s*(\d+)/;

const cmdZ = (c) => c.keys([{ key: 'z', modifierFlags: XCUI_COMMAND }]);

async function openSettingsSection(c, label) {
  await c.tap('Settings');
  await c.sleep(SETTLE_MS);
  await tapLabel(c, label, { androidOnly: true });
  await c.sleep(SETTLE_MS);
  // v1.6.0 shows Parent Center locked behind a button that opens the grown-up check.
  if (await visible(c, 'Unlock these settings')) {
    await c.tap('Unlock these settings');
    await c.sleep(SETTLE_MS);
  }
}

// An arm that ignores Escape (v1.6.0 native, X49) leaves the surface open; close it by hand after
// the capture so the next step starts from the drawing screen.
async function closeMenu(c, trigger, option) {
  if (await visible(c, option)) {
    await c.tap(trigger);
    await c.sleep(MENU_MS);
  }
}

async function closePicker(c) {
  const nodes = await c.nodes();
  const hex = nodes.filter((n) => /^#[0-9A-F]{6}$/i.test(n.name) && n.visible !== 'false');
  if (!hex.length) return;
  const app = appFrame(nodes);
  const bottom = Math.max(...hex.map((h) => h.frame.y + h.frame.h));
  const y = Math.min(bottom + SCRIM_BELOW_PICKER_PT, app.h - SCRIM_BOTTOM_MARGIN_PT);
  await c.tapPoint(app.w / 2, y, 'picker scrim');
  await c.sleep(SETTLE_MS);
}

async function gateAnswer(c) {
  for (const node of await c.nodes()) {
    const match = `${node.name} ${node.label}`.match(GATE_PROBLEM);
    if (!match) continue;
    const [a, op, b] = [Number(match[1]), match[2], Number(match[3])];
    if (/times|×/.test(op)) return a * b;
    return /plus|\+/.test(op) ? a + b : a - b;
  }
  throw new Error('no gate problem');
}

const feedbackField = async (c) =>
  (await c.nodes()).find(
    (node) => /TextView|TextField|EditText/.test(node.tag) && node.visible !== 'false'
  );

export const KEY1_KEYBOARD_STEPS = [
  {
    id: 'cmd-z-drawer-open',
    setup: async (c) => {
      await setPaperFromWindow(c);
      await c.tap('Expand controls');
      await c.sleep(MENU_MS);
      await c.stroke(c.zigzag(0.45));
      await c.sleep(SETTLE_MS);
    },
    run: cmdZ,
  },
  {
    id: 'cmd-z-drawer-closed',
    setup: async (c) => {
      await c.stroke(c.zigzag(0.55));
      await c.sleep(SETTLE_MS);
      await c.tap('Collapse controls');
      await c.sleep(SETTLE_MS);
    },
    run: cmdZ,
  },
  { id: 'cmd-z-empty-history', run: cmdZ },
  {
    id: 'escape-brush-menu',
    setup: async (c) => {
      await c.tap('Expand controls');
      await c.sleep(MENU_MS);
      await c.tap('Brushes');
      await c.sleep(MENU_MS);
    },
    run: (c) => c.hid(HID_ESCAPE, 'Escape'),
    after: (c) => closeMenu(c, 'Brushes', 'Crayon'),
  },
  {
    id: 'escape-width-menu',
    setup: async (c) => {
      await c.tap('Stroke width');
      await c.sleep(MENU_MS);
    },
    run: (c) => c.hid(HID_ESCAPE, 'Escape'),
    after: (c) => closeMenu(c, 'Stroke width', 'Size 1'),
  },
  {
    id: 'escape-picker',
    setup: async (c) => {
      await c.tap('Custom Color');
      await c.sleep(SETTLE_MS);
    },
    run: (c) => c.hid(HID_ESCAPE, 'Escape'),
    after: closePicker,
  },
  {
    id: 'escape-settings',
    setup: async (c) => {
      await c.tap('Settings');
      await c.sleep(SETTLE_MS);
    },
    run: (c) => c.hid(HID_ESCAPE, 'Escape'),
    after: (c) => closeIfOpen(c),
  },
  {
    id: 'text-field-cmd-z',
    setup: async (c) => {
      await closeIfOpen(c);
      // Above the iPad Settings card and clear of the palette bar, so the ink shows behind the dialog.
      await c.stroke(c.zigzag(c.ios ? 0.18 : 0.25));
      await c.sleep(SETTLE_MS);
      await openSettingsSection(c, 'Feedback');
      const field = await feedbackField(c);
      if (!field) throw new Error('no feedback text field');
      const { frame } = field;
      await c.tapPoint(frame.x + frame.w / 2, frame.y + frame.h / 2, 'feedback field');
      await c.sleep(MENU_MS);
      await c.keys([...TYPED_TEXT]);
      await c.sleep(SETTLE_MS);
      c.note(`typed ${JSON.stringify(TYPED_TEXT)} into the feedback field`);
    },
    run: cmdZ,
    after: async (c) => {
      const field = await feedbackField(c);
      c.note(`feedback field after Cmd+Z: ${JSON.stringify(field?.value ?? null)}`);
    },
  },
  {
    id: 'gate-keys',
    setup: async (c) => {
      await closeIfOpen(c);
      await openSettingsSection(c, 'Parent Center');
    },
    run: async (c) => {
      const answer = String(await gateAnswer(c));
      c.note(`gate answer ${answer}`);
      await c.keys(['9']);
      await c.sleep(KEY_GAP_MS);
      await c.hid(HID_BACKSPACE, 'Backspace');
      await c.sleep(KEY_GAP_MS);
      await c.keys([...answer]);
      await c.sleep(KEY_GAP_MS);
      return c.hid(HID_RETURN, 'Return');
    },
  },
];
