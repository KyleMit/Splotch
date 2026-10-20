// The DS-1 fixture: the Settings choices a state batch starts from, the fixture strokes, and the
// ways each arm's menus and picker are reached and closed.

const MENU_MS = 700;
const CHOICE_MS = 600;
const SECTION_MS = 1200;
const CLOSE_MS = 1000;
const UNDO_MS = 900;
const UNDO_PRESSES_MAX = 12;
const SETTINGS_WAIT_MS = 30_000;
// The v1.6.0 Appearance card's text sits this far left of its own Night Mode switch.
const REFERENCE_APPEARANCE_OFFSET_PT = 130;
// Android exposes neither the RN testID nor a named WebView dialog; the hexagons' union, padded by
// the card inset, stands in for the picker card.
const PICKER_CARD_INSET_PT = 16;
const SCRIM_BELOW_MIN_PT = 70;
const SCRIM_BELOW_REACH_PT = 60;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const WIDE_SETTINGS = new Set(['Theme', 'Button style', 'Lock device rotation']);

async function referenceRotationFixture(driver, nodes) {
  const lock = nodes.find(
    (node) => node.name === 'Lock device rotation' && /Switch|ToggleButton/.test(node.tag)
  );
  if (!lock) return null;
  // v1.6.0's Android WebView reports its toggles unchecked whatever their state; the force
  // landscape row renders only while the lock is on.
  const on = driver.ios
    ? lock.value === '1'
    : lock.checked === 'true' || nodes.some((node) => node.name === 'Force landscape orientation');
  if (on) {
    await driver.tap('Lock device rotation');
    await sleep(CHOICE_MS);
  }
  return 'Lock device rotation off';
}

async function openAppearance(driver, kind, nodes) {
  if (kind === 'native' || !driver.ios) {
    await driver.tap('Appearance', { prefix: true });
    return;
  }
  // The v1.6.0 Appearance card reports a detached accessibility frame; tap the card's text,
  // derived from its own Night Mode switch frame.
  const toggle = nodes.find((node) => node.name === 'Night Mode' && /Switch/.test(node.tag));
  if (!toggle) throw new Error('reference Appearance card not found');
  const { frame } = toggle;
  const x = frame.x - REFERENCE_APPEARANCE_OFFSET_PT;
  await driver.tapPoint(x, frame.y + frame.h / 2, 'Appearance card (reference)');
}

export async function settingsFixture(driver, { kind, style }) {
  await driver.tap('Settings', { timeout: SETTINGS_WAIT_MS });
  await sleep(SECTION_MS);
  let nodes = await driver.nodes();
  if (!nodes.some((node) => WIDE_SETTINGS.has(node.name))) {
    await openAppearance(driver, kind, nodes);
    await sleep(SECTION_MS);
    nodes = await driver.nodes();
  }
  const done = { style: null, orientation: null };
  if (kind === 'native') {
    const label = style === 'flat' ? 'Flat' : 'Raised';
    if (nodes.some((node) => node.name === label)) {
      await driver.tap(label);
      done.style = label;
      await sleep(CHOICE_MS);
    }
    if (nodes.some((node) => node.name === 'Auto')) {
      await driver.tap('Auto');
      done.orientation = 'Auto';
      await sleep(CHOICE_MS);
    }
  } else {
    if (style === 'flat') throw new Error('the webview reference has no Button style');
    done.style = 'n/a (v1.6.0 has no Button style; Raised is its only chrome)';
    done.orientation = await referenceRotationFixture(driver, nodes);
  }
  await driver.tap('Close');
  await sleep(CLOSE_MS);
  return done;
}

export async function openColorsMenu(driver) {
  const colors = (await driver.nodes()).find((node) => node.name === 'Colors');
  if (!colors) throw new Error('no Colors control');
  const expanded =
    colors.value === 'expanded' || colors.value === '1' || colors.selected === 'true';
  if (!expanded) {
    await driver.tap('Colors');
    await sleep(MENU_MS);
  }
}

// The theme retint names the Black paint "White" in dark mode on both arms.
export async function pickColor(driver, name, landscapePhone) {
  if (landscapePhone) await openColorsMenu(driver);
  if (name === 'Black' && !(await driver.exists('Black')) && (await driver.exists('White'))) {
    return driver.tap('White');
  }
  return driver.tap(name);
}

function hexUnion(frames) {
  const hex = frames.filter((frame) => /^#[0-9A-F]{6}$/i.test(frame.name));
  if (!hex.length) return null;
  const x0 = Math.min(...hex.map((f) => f.frame.x)) - PICKER_CARD_INSET_PT;
  const y0 = Math.min(...hex.map((f) => f.frame.y)) - PICKER_CARD_INSET_PT;
  const x1 = Math.max(...hex.map((f) => f.frame.x + f.frame.w)) + PICKER_CARD_INSET_PT;
  const y1 = Math.max(...hex.map((f) => f.frame.y + f.frame.h)) + PICKER_CARD_INSET_PT;
  return { name: 'hex union', frame: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

// The widest empty margin beside the picker card, measured inside the arm's own content frame: the
// v1.6.0 WebView can stop short of the window (contentInset), and a tap outside it lands on no
// scrim.
export function pickerScrimPoint(frames, win) {
  const card =
    frames.find((frame) => frame.name === 'color-picker-card') ??
    frames.find((frame) => /web dialog/.test(frame.name)) ??
    hexUnion(frames);
  if (!card) throw new Error('picker card not found');
  const web = frames.find((frame) => frame.name === 'Splotch - Drawing for Kids');
  const content = web ? web.frame : { x: 0, y: 0, w: win.width, h: win.height };
  const c = card.frame;
  const below = content.y + content.h - (c.y + c.h);
  const right = content.x + content.w - (c.x + c.w);
  const left = c.x - content.x;
  if (below >= SCRIM_BELOW_MIN_PT) {
    return [c.x + c.w / 2, c.y + c.h + Math.min(below / 2, SCRIM_BELOW_REACH_PT)];
  }
  if (right >= left) return [c.x + c.w + right / 2, c.y + c.h / 2];
  return [content.x + left / 2, c.y + c.h / 2];
}

export async function countUndo(driver) {
  let presses = 0;
  for (; presses < UNDO_PRESSES_MAX; presses += 1) {
    const undo = (await driver.nodes()).find((node) => node.name === 'Undo');
    if (!undo || undo.enabled === 'false') break;
    await driver.tap('Undo');
    await sleep(UNDO_MS);
  }
  return presses;
}

// The fixture strokes, normalized to the paper: a zigzag, a circle, and a diagonal.
export function fixturePaths() {
  const zigzag = Array.from({ length: 60 }, (_, i) => {
    const t = i / 59;
    const phase = (t * 6) % 1;
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    return [0.15 + 0.7 * t, 0.25 + 0.1 * tri];
  });
  const circle = Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    return [0.35 + 0.12 * Math.cos(a), 0.6 + 0.12 * Math.sin(a)];
  });
  const diagonal = Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    return [0.55 + 0.3 * t, 0.45 + 0.35 * t];
  });
  return { zigzag, circle, diagonal };
}
