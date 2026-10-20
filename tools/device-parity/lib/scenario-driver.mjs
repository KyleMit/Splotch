// The gestures and probes one crash-scenario run is built from, bound to one session and app.
import { join } from 'node:path';
import { createForegroundGuard } from './app-foreground.mjs';
import { CRASH_TARGETS } from './crash-targets.mjs';
import { androidHeapMb, androidPssMb, hostRssMb, simAppPid } from './crash-verdict.mjs';
import { adb, sendAndroidKey, startAndroidApp, writeScreenshot } from './device-commands.mjs';
import {
  MOVE_STEP_MS,
  clampToSafeArea,
  clearDragPoints,
  createSeededRandom,
  pointerChain,
  scribblePoints,
} from './pointer-chains.mjs';

const STROKE_STEP_MS = 12;
const STROKE_GAP_MS = 30;
const MENU_SETTLE_MS = 400;
const RAIL_SETTLE_MS = 600;
const LIBRARY_SETTLE_MS = 1500;
const PAGE_OPEN_SETTLE_MS = 2500;
const LIBRARY_LEVELS_MAX = 3;
const NOTE_ERROR_CHARS = 80;
const NAMES_LISTED_MAX = 30;
const PAGE_CANDIDATES_LISTED_MAX = 6;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const shortError = (error) => String(error.message).slice(0, NOTE_ERROR_CHARS);

export function createScenarioDriver({ session, target, bundleId, out, label, seed, run }) {
  const ios = session.platform === 'ios';
  const { maxFingers, physical } = CRASH_TARGETS[target];
  const notes = [];
  const note = (text) => notes.push(text);
  const random = createSeededRandom(seed, run);
  const assertForeground = createForegroundGuard({
    session,
    bundleId,
    onNote: (text) => notes.includes(text) || notes.push(text),
  });
  let win = null;
  let clearAt = null;
  const chain = (id, segments) => pointerChain(id, segments, (p) => clampToSafeArea(win, p));
  const scribble = (count) => scribblePoints(win, random, count);

  async function refreshWindow() {
    win = await session.windowRect();
    clearAt = null;
  }

  async function find(name) {
    let [element] = await session.findAll('accessibility id', name);
    // The reference app's WebView names its controls in `text`, not `content-desc`.
    if (!element && !ios) {
      const quoted = JSON.stringify(name);
      [element] = await session.findAll('xpath', `//*[@text=${quoted} or @content-desc=${quoted}]`);
    }
    return element ?? null;
  }

  async function tapName(name, required = true) {
    const element = await find(name);
    if (!element) {
      if (required) throw new Error(`no ${name}`);
      return false;
    }
    const r = await session.rect(element);
    await assertForeground();
    const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    await session.actions([chain('tap', [{ points: [center], raw: true }])]);
    return true;
  }

  async function strokes(count, points = 14, fingers = 1) {
    const chains = [];
    for (let finger = 0; finger < fingers; finger += 1) {
      const segments = [];
      for (let index = 0; index < count; index += 1) {
        segments.push({ points: scribble(points), step: STROKE_STEP_MS }, { pause: STROKE_GAP_MS });
      }
      chains.push(chain(`f${finger}`, segments));
    }
    await assertForeground();
    try {
      await session.actions(chains);
    } catch (error) {
      if (chains.length < 2 || !String(error.message).includes('W3C actions')) throw error;
      // UiAutomator2 sometimes refuses a multi-finger chain outright; its fingers then draw in turn.
      note(`multi-finger chain refused (${chains.length} fingers); drawn one finger at a time`);
      for (const single of chains) await session.actions([single]);
    }
  }

  function shot(name) {
    if (physical && ios) return;
    try {
      writeScreenshot(session.platform, session.device, join(out, `${label}-${name}.png`));
    } catch (error) {
      note(`shot ${name}: ${shortError(error)}`);
    }
  }

  async function clearCenter() {
    if (clearAt) return clearAt;
    let element = await find('Clear drawing');
    // A collapsed control rail (fresh launch, or a coloring page in the reference app) hides Clear.
    if (!element && (await tapName('Expand controls', false))) {
      await sleep(RAIL_SETTLE_MS);
      element = await find('Clear drawing');
    }
    if (!element) {
      shot('no-clear');
      const xml = await session.source();
      const names = [...xml.matchAll(/(?:name|content-desc|text)="([^"]{2,40})"/g)].map(
        (m) => m[1]
      );
      note(`names without Clear: ${[...new Set(names)].slice(0, NAMES_LISTED_MAX).join(' | ')}`);
      throw new Error('no Clear drawing');
    }
    const r = await session.rect(element);
    clearAt = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    return clearAt;
  }

  // release "commit" ends past the accept radius; "cancel" ends back near Clear.
  function clearSegment(center, { hz, seconds, lo, hi, release = 'commit' }) {
    const finalFraction = release === 'commit' ? Math.max(hi, 1.3) : 0.3;
    const { points } = clearDragPoints({ win, center, hz, seconds, lo, hi, finalFraction });
    return { points, step: MOVE_STEP_MS, raw: true };
  }

  async function clearDrag(options) {
    const center = await clearCenter();
    await assertForeground();
    await session.actions([chain('clear', [clearSegment(center, options)])]);
  }

  async function chooseBrush(name) {
    await tapName('Expand controls', false);
    await sleep(MENU_SETTLE_MS);
    if (!(await tapName('Brushes', false))) return false;
    await sleep(MENU_SETTLE_MS);
    const chosen = await tapName(name, false);
    await sleep(MENU_SETTLE_MS);
    return chosen;
  }

  async function openFirstPage() {
    if (!(await tapName('Coloring books', false))) return false;
    // The reference app opens on its book shelf, the RN app may open on a book's pages: tap a page
    // when one is listed, otherwise a book, and look again.
    for (let level = 0; level < LIBRARY_LEVELS_MAX; level += 1) {
      await sleep(LIBRARY_SETTLE_MS);
      const xml = await session.source();
      const names = [
        ...xml.matchAll(/(?:name|content-desc|text)="([^"]*(?:Farm|page|Page)[^"]*)"/g),
      ].map((m) => m[1]);
      const listed = [...new Set(names)].slice(0, PAGE_CANDIDATES_LISTED_MAX);
      note(`coloring candidates ${level}: ${listed.join(' | ')}`);
      const pages = names.filter((name) => /coloring page$/i.test(name));
      for (const name of pages.length ? pages : names) if (await tapName(name, false)) break;
      if (pages.length) break;
    }
    await sleep(PAGE_OPEN_SETTLE_MS);
    return true;
  }

  function memoryMb() {
    if (target === 'ios-simulator') {
      const { pid } = simAppPid(session.device, bundleId);
      const mb = pid ? hostRssMb(pid) : null;
      return mb === null ? null : Math.round(mb);
    }
    if (ios) return null;
    const mb = androidPssMb(session.device, bundleId);
    return mb === null ? null : Math.round(mb);
  }

  const heapMb = () => (ios ? memoryMb() : androidHeapMb(session.device, bundleId));

  async function sendHome() {
    if (ios) await session.exec('mobile: pressButton', { name: 'home' });
    else sendAndroidKey(session.device, 'KEYCODE_HOME');
  }

  async function bringBack() {
    if (ios) await session.exec('mobile: activateApp', { bundleId });
    else startAndroidApp(session.device, bundleId);
  }

  function trimMemory(level) {
    adb(session.device, 'shell', 'am', 'send-trim-memory', bundleId, level);
  }

  return {
    session,
    ios,
    target,
    maxFingers,
    physical,
    notes,
    note,
    random,
    get win() {
      return win;
    },
    assertForeground,
    refreshWindow,
    chain,
    scribble,
    find,
    tapName,
    strokes,
    shot,
    clearCenter,
    clearSegment,
    clearDrag,
    chooseBrush,
    openFirstPage,
    memoryMb,
    heapMb,
    sendHome,
    bringBack,
    trimMemory,
  };
}
