// The inputs a parity run sends to one arm, each checked against the foreground first and logged
// with its time so a capture can be lined up with what caused it.
import { namedFrames, parseNodes } from './accessibility-nodes.mjs';
import { display0Focus, focusedPackage, readDisplays } from './android-display.mjs';
import { createForegroundGuard } from './app-foreground.mjs';
import { sendAndroidKey, sendAndroidKeyCombination, sendSystemBack } from './device-commands.mjs';
import { launchArm, terminateArm } from './parity-lifecycle.mjs';
import { strokeChain, tapChain } from './pointer-chains.mjs';

// Each stroke is sampled every 8 ms: the parity protocols' input cadence.
const STROKE_SAMPLE_MS = 8;
const WAIT_POLL_MS = 250;
const TAP_WAIT_MS = 8000;
const WAIT_DEFAULT_MS = 20_000;
const MULTI_TAP_HOLD_MS = 40;
const IMMERSIVE_NOTICE_WAIT_MS = 1500;
const IMMERSIVE_NOTICE_SETTLE_MS = 800;
// Raw HID keyboard usages (page 7) reach UIKit's Delete, Escape, and Return inputs, which
// XCUITest's typeKey does not deliver as UIKeyCommands.
const HID_KEYBOARD_PAGE = 7;
const HID_PRESS_SECONDS = 0.05;
const ANDROID_HID_KEYCODES = { 0x28: 'KEYCODE_ENTER', 0x29: 'KEYCODE_ESCAPE', 0x2a: 'KEYCODE_DEL' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function androidKeycode(character) {
  if (/^[0-9]$/.test(character)) return `KEYCODE_${character}`;
  if (/^[a-z]$/i.test(character)) return `KEYCODE_${character.toUpperCase()}`;
  if (character === ' ') return 'KEYCODE_SPACE';
  throw new Error(`no Android keycode for ${JSON.stringify(character)}`);
}

// KEY-1 on Android sends the same presses through the input service's hardware-key path; a
// Command modifier becomes Ctrl, the shortcut Android keyboards carry.
function sendAndroidPress(serial, press) {
  if (typeof press === 'string') return sendAndroidKey(serial, androidKeycode(press));
  if (press.modifierFlags) {
    return sendAndroidKeyCombination(serial, 'KEYCODE_CTRL_LEFT', androidKeycode(press.key));
  }
  return sendAndroidKey(serial, androidKeycode(press.key));
}

export function createParityDriver({ session, arm, density, allowSystemBack = false, onNote }) {
  const ios = session.platform === 'ios';
  const device = session.device;
  const inputScale = ios ? 1 : density;
  const toInput = (value) => Math.round(value * inputScale);
  const inputs = [];
  const logged = (entry) => {
    const t = Date.now();
    inputs.push({ t, ...entry });
    return t;
  };
  const assertForeground = createForegroundGuard({
    session,
    bundleId: arm.bundleId,
    onNote,
    checkDisplay0: !ios,
  });
  const nameFor = (key) => arm.aliases[key] ?? key;

  function findName(name) {
    if (ios) return session.findAll('accessibility id', name);
    const quoted = JSON.stringify(name);
    return session.findAll('xpath', `//*[@content-desc=${quoted} or @text=${quoted}]`);
  }

  function findPrefix(prefix) {
    const quoted = JSON.stringify(prefix);
    if (ios) return session.findAll('-ios predicate string', `name BEGINSWITH ${quoted}`);
    return session.findAll(
      'xpath',
      `//*[starts-with(@content-desc,${quoted}) or starts-with(@text,${quoted})]`
    );
  }

  async function waitFor(find, what, ms = WAIT_DEFAULT_MS) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = await find().catch(() => []);
      if (found.length) return found;
      await sleep(WAIT_POLL_MS);
    }
    throw new Error(`timeout waiting for ${what}`);
  }

  const exists = async (name) => (await findName(name).catch(() => [])).length > 0;
  const nodes = async () => parseNodes(await session.source(), session.platform, density);
  const framesOf = (xml) => namedFrames(parseNodes(xml, session.platform, density));

  async function centerOf(key) {
    const name = nameFor(key);
    const [element] = await waitFor(() => findName(name), name, TAP_WAIT_MS);
    const r = await session.rect(element);
    const scale = ios ? 1 : density;
    return { x: (r.x + r.width / 2) / scale, y: (r.y + r.height / 2) / scale };
  }

  async function tap(key, { prefix = false, timeout = TAP_WAIT_MS } = {}) {
    const name = nameFor(key);
    const [element] = await waitFor(
      () => (prefix ? findPrefix(name) : findName(name)),
      name,
      timeout
    );
    await assertForeground();
    await session.click(element);
    return logged({ tap: key });
  }

  async function tapPoint(x, y, why) {
    await assertForeground();
    await session.tapAt(toInput(x), toInput(y));
    return logged({ tapPoint: [x, y], why });
  }

  async function multiTap(key, count, gapMs) {
    const center = await centerOf(key);
    const point = { x: toInput(center.x), y: toInput(center.y) };
    await assertForeground();
    await session.actions([
      tapChain('finger1', point, { count, gapMs, holdMs: MULTI_TAP_HOLD_MS }),
    ]);
    return logged({ multiTap: key, count, gapMs });
  }

  // A drag from a control's centre along (dx, dy) points over durMs.
  async function drag(key, dx, dy, durMs) {
    const center = await centerOf(key);
    const samples = Math.max(2, Math.round(durMs / STROKE_SAMPLE_MS));
    const points = Array.from({ length: samples + 1 }, (_, i) => ({
      x: toInput(center.x + (dx * i) / samples),
      y: toInput(center.y + (dy * i) / samples),
    }));
    await assertForeground();
    await session.actions([strokeChain('finger1', points, STROKE_SAMPLE_MS)]);
    return logged({ drag: key, dx, dy, durMs });
  }

  // `path` is [u, v] pairs normalized to `rect` (points); the result is in input units.
  async function strokePath(rect, path) {
    const points = path.map(([u, v]) => ({
      x: toInput(rect.x + u * rect.w),
      y: toInput(rect.y + v * rect.h),
    }));
    await assertForeground();
    const strokeStart = Date.now();
    await session.actions([strokeChain('finger1', points, STROKE_SAMPLE_MS)]);
    return logged({ strokeStart, samples: path.length });
  }

  async function keys(list) {
    await assertForeground();
    const keysStart = Date.now();
    if (ios) await session.exec('mobile: keys', { keys: list });
    else for (const press of list) sendAndroidPress(device, press);
    return logged({ keysStart, keys: list });
  }

  async function hid(usage, why) {
    await assertForeground();
    const hidStart = Date.now();
    if (ios) {
      await session.exec('mobile: performIoHidEvent', {
        page: HID_KEYBOARD_PAGE,
        usage,
        durationSeconds: HID_PRESS_SECONDS,
      });
    } else {
      sendAndroidKey(device, ANDROID_HID_KEYCODES[usage]);
    }
    return logged({ hidStart, usage, why });
  }

  async function back() {
    if (ios) throw new Error('Back is Android-only');
    if (!allowSystemBack) throw new Error('Back is sent only by a slice whose subject is Back');
    await assertForeground();
    sendSystemBack(device);
    return logged({ key: 'BACK' });
  }

  const foregroundPackage = () => focusedPackage(display0Focus(readDisplays(device)));

  async function launch() {
    const t = Date.now();
    await launchArm({ session, platform: session.platform, device, arm });
    inputs.push({ t, launch: arm.bundleId });
    return t;
  }

  const terminate = () => terminateArm({ session, platform: session.platform, device, arm });

  // Android confirms immersive mode over an app's first launch; it is OS chrome, dismissed alike.
  async function dismissImmersiveNotice({ waitFirst = true } = {}) {
    if (ios) return;
    if (waitFirst) await sleep(IMMERSIVE_NOTICE_WAIT_MS);
    const [notice] = await findName('Got it').catch(() => []);
    if (!notice) return;
    await session.click(notice);
    await sleep(IMMERSIVE_NOTICE_SETTLE_MS);
  }

  return {
    ios,
    inputs,
    nameFor,
    findName,
    waitFor,
    exists,
    nodes,
    framesOf,
    tap,
    tapPoint,
    multiTap,
    drag,
    strokePath,
    keys,
    hid,
    back,
    foregroundPackage,
    launch,
    terminate,
    dismissImmersiveNotice,
  };
}
