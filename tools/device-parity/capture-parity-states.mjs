// DS-1: settled captures of the drawing screen's states (blank, drawer, brush and width menus, the
// colour menu, the custom picker, inked coloring page) for each arm across style, theme, and
// orientation combos, on an iOS simulator or Android emulator. Each state writes a PNG, the page
// source, and a sidecar of named control frames under <out>/<target>/<arm>/<style-theme-orient>/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSITIVE_NUMBER, fail, isMain, runMain, sleep } from '../lib/proc.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { listFlag, numberFlag, parseFlags } from './lib/cli-flags.mjs';
import { screenshot } from './lib/device-commands.mjs';
import { scanPaperRect } from './lib/paper-scan.mjs';
import { readArmsManifest, selectArms } from './lib/parity-arms.mjs';
import { createParityDriver } from './lib/parity-driver.mjs';
import {
  androidDisplayState,
  freshInstall,
  runtimeLabel,
  setAppearance,
  setDeviceOrientation,
} from './lib/parity-lifecycle.mjs';
import { settleCapture } from './lib/settle-capture.mjs';
import {
  countUndo,
  fixturePaths,
  openColorsMenu,
  pickColor,
  pickerScrimPoint,
  settingsFixture,
} from './lib/state-capture-fixture.mjs';

const STATES = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's12'];
const STYLES = ['raised', 'flat'];
const THEMES = ['light', 'dark'];
const ORIENTATIONS = ['portrait', 'landscape'];
const LAUNCH_WAIT_MS = 40_000;
const MENU_MS = 700;
const CHOICE_MS = 600;
const STROKE_GAP_MS = 400;
const LIBRARY_MS = 1500;
const LAUNCH_SETTLE_MS = 1500;
const SCRIM_CLOSE_MS = 1000;
const PAGE_MS = 2500;
const THEME_SETTLE_MS = 800;
const CARDINALITY_SETTLE_MS = 1200;

const FLAGS = {
  session: { type: 'string' },
  target: { type: 'string' },
  'arms-file': { type: 'string' },
  arms: { type: 'string' },
  combos: { type: 'string' },
  states: { type: 'string', default: STATES.join(',') },
  'landscape-rotation': { type: 'string' },
  cardinality: { type: 'boolean', default: false },
  density: { type: 'string', default: '1' },
  phone: { type: 'boolean', default: false },
  out: { type: 'string' },
};

function parseCombo(combo) {
  const [style, theme, orientation] = combo.split('-');
  if (!STYLES.includes(style) || !THEMES.includes(theme) || !ORIENTATIONS.includes(orientation)) {
    fail(`--combos entries are <${STYLES}>-<${THEMES}>-<${ORIENTATIONS}>, got "${combo}"`);
  }
  return { style, theme, orientation };
}

export function parseParityStateFlags(argv) {
  const { values } = parseFlags(argv, {
    options: FLAGS,
    required: ['session', 'target', 'arms-file', 'arms', 'combos', 'out'],
  });
  const rotation = values['landscape-rotation'];
  if (rotation !== undefined && !['1', '3'].includes(rotation)) {
    fail('--landscape-rotation is the Android display rotation to pin landscape to: 1 or 3');
  }
  return {
    sessionFile: values.session,
    target: values.target,
    armsFile: values['arms-file'],
    armTags: values.arms.split(',').filter(Boolean),
    combos: values.combos.split(',').filter(Boolean).map(parseCombo),
    states: new Set(listFlag(values, 'states', STATES)),
    landscapeRotation: rotation === undefined ? undefined : Number(rotation),
    cardinality: values.cardinality,
    density: numberFlag(values, 'density', POSITIVE_NUMBER),
    phone: values.phone,
    out: values.out,
  };
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function createBatchCapture({ session, driver, dir, info }) {
  const shot = () => screenshot(session.platform, session.device);
  return async function capture(stem, lastInputAt) {
    const settle = await settleCapture(shot, join(dir, `${stem}.png`), lastInputAt);
    const xml = await session.source();
    writeFileSync(join(dir, `${stem}.xml`), xml);
    const display = driver.ios ? null : androidDisplayState(session.device);
    const landscape = info.axes.orientation === 'landscape';
    if (display && (display.rotation % 2 === 1) !== landscape) {
      console.warn(
        `  WARN ${stem} captured at rotation ${display.rotation} (${display.appOrientation})`
      );
    }
    const sidecar = {
      ...info,
      state: stem,
      settle,
      display,
      inputs: driver.inputs.slice(),
      frames: driver.framesOf(xml),
    };
    writeJson(join(dir, `${stem}.json`), sidecar);
    console.log(`  ${stem} settled=${settle.settled} frames=${settle.frames} ${settle.settleMs}ms`);
    return sidecar;
  };
}

// RN reports its own paper frame; the WebView reference does not, so it uses the scanned blank.
async function paperFor({ session, dir, blank, density }) {
  const paper = await scanPaperRect(join(dir, 's01-blank.png'));
  const imageWidth = paper.imageSize[0];
  const screenWidth =
    session.platform === 'ios' ? (await session.windowRect()).width : imageWidth / density;
  const pxPerPt = imageWidth / screenWidth;
  const scanned = {
    x: paper.px.x / pxPerPt,
    y: paper.px.y / pxPerPt,
    w: paper.px.w / pxPerPt,
    h: paper.px.h / pxPerPt,
  };
  const ownFrame = blank.frames.find((frame) => frame.name === 'drawing-paper')?.frame ?? null;
  return {
    scanned,
    color: paper.paperColor,
    rnDrawingPaperFrame: ownFrame,
    imagePxPerPt: pxPerPt,
    imageSize: paper.imageSize,
    strokeRect: ownFrame ?? scanned,
  };
}

async function menuStates({ driver, capture, states, landscapePhone }) {
  if (states.has('s02')) await capture('s02-drawer-open', await driver.tap('Expand controls'));
  if (states.has('s03')) {
    await capture('s03-brush-menu', await driver.tap('Brushes'));
    await driver.tap('Pen');
    await sleep(MENU_MS);
  }
  if (states.has('s04')) {
    await capture('s04-pen-width-menu', await driver.tap('Stroke width'));
    await driver.tap('Stroke width');
    await sleep(MENU_MS);
  }
  if (states.has('s05')) {
    for (const name of ['Brushes', 'Eraser']) {
      await driver.tap(name);
      await sleep(MENU_MS);
    }
    await capture('s05-eraser-width-menu', await driver.tap('Stroke width'));
    for (const name of ['Stroke width', 'Brushes', 'Pen']) {
      await driver.tap(name);
      await sleep(MENU_MS);
    }
  }
  if (states.has('s06') && landscapePhone) {
    await capture('s06-color-menu', await driver.tap('Colors'));
    await driver.tap('Colors');
    await sleep(MENU_MS);
  }
}

async function customPickerState({ session, driver, capture, paper, density, landscapePhone }) {
  if (landscapePhone) await openColorsMenu(driver);
  const picker = await capture('s07-custom-picker', await driver.tap('Custom Color'));
  const win =
    session.platform === 'ios'
      ? await session.windowRect()
      : { width: paper.imageSize[0] / density, height: paper.imageSize[1] / density };
  const [x, y] = pickerScrimPoint(picker.frames, win);
  await driver.tapPoint(x, y, 'picker scrim');
  await sleep(SCRIM_CLOSE_MS);
}

// The fixture strokes with three brushes on the Farm book's Cat page; the optional cardinality
// card counts their undo steps, with one continuous contact as the negative control.
async function inkedPageState({ driver, capture, paper, landscapePhone, cardinality, dir }) {
  await driver.tap('Coloring books');
  await sleep(LIBRARY_MS);
  // A library that opens on its shelf needs the Farm book opened before its pages show.
  if (!(await driver.exists('Cat coloring page')) && (await driver.exists('Farm coloring book'))) {
    await driver.tap('Farm coloring book');
    await sleep(LIBRARY_MS);
  }
  await driver.tap('Cat coloring page');
  await sleep(PAGE_MS);
  const { zigzag, circle, diagonal } = fixturePaths();
  const brushStroke = async (brush, color, path) => {
    if (brush) {
      await driver.tap('Brushes');
      await sleep(CHOICE_MS);
      await driver.tap(brush);
      await sleep(CHOICE_MS);
    }
    if (color) {
      await pickColor(driver, color, landscapePhone);
      await sleep(CHOICE_MS);
    }
    return driver.strokePath(paper.strokeRect, path);
  };
  await brushStroke(null, 'Black', zigzag);
  await sleep(STROKE_GAP_MS);
  await brushStroke('Crayon', 'Purple', circle);
  await sleep(STROKE_GAP_MS);
  await capture('s12-farm-ink', await brushStroke('Magic brush', null, diagonal));
  if (!cardinality) return;
  const separateStrokes = await countUndo(driver);
  await driver.strokePath(paper.strokeRect, [...zigzag, ...circle, ...diagonal]);
  await sleep(CARDINALITY_SETTLE_MS);
  const continuousContact = await countUndo(driver);
  const card = {
    separateStrokes,
    expected: 3,
    continuousContact,
    expectedNegative: 1,
    admitted: separateStrokes === 3 && continuousContact === 1,
  };
  writeJson(join(dir, 'cardinality.json'), card);
  console.log(`  cardinality ${JSON.stringify(card)}`);
}

async function captureBatch({ session, options, arm, combo, runtime, cardinality }) {
  const { platform, device } = session;
  const key = `${combo.style}-${combo.theme}-${combo.orientation}`;
  const dir = join(options.out, options.target, arm.tag, key);
  mkdirSync(dir, { recursive: true });
  const notes = [];
  const driver = createParityDriver({
    session,
    arm,
    density: options.density,
    onNote: (text) => notes.includes(text) || notes.push(text),
  });
  const info = {
    target: options.target,
    arm: arm.tag,
    kind: arm.kind,
    bundleId: arm.bundleId,
    sourceSha: arm.sourceSha,
    artifactSha256: arm[platform].digest,
    runtime,
    axes: combo,
  };
  console.log(`batch ${options.target} ${arm.tag} ${key}`);
  const orient = (orientation) =>
    setDeviceOrientation({
      session,
      platform,
      device,
      orientation,
      landscapeRotation: options.landscapeRotation,
    });
  const launchSettled = async () => {
    const t = await driver.launch();
    await driver.dismissImmersiveNotice();
    await driver.waitFor(() => driver.findName('Settings'), 'Settings button', LAUNCH_WAIT_MS);
    return t;
  };
  await orient('portrait');
  freshInstall({ platform, device, arm });
  setAppearance({ platform, device, theme: combo.theme });
  await sleep(THEME_SETTLE_MS);
  await launchSettled();
  await sleep(LAUNCH_SETTLE_MS);
  info.fixture = await settingsFixture(driver, { kind: arm.kind, style: combo.style });
  await orient(combo.orientation);
  await driver.terminate();
  driver.inputs.length = 0;

  const capture = createBatchCapture({ session, driver, dir, info });
  const blank = await capture('s01-blank', await launchSettled());
  // The phone-landscape Color Button postdates v1.6.0; an arm without it keeps its palette.
  info.colorButton = blank.frames.some((frame) => frame.name === 'Colors');
  const landscapePhone = options.phone && combo.orientation === 'landscape' && info.colorButton;
  const paper = await paperFor({ session, dir, blank, density: options.density });
  info.paper = paper;
  writeJson(join(dir, 'paper.json'), paper);
  const context = {
    session,
    driver,
    capture,
    paper,
    density: options.density,
    landscapePhone,
    dir,
  };
  await menuStates({ ...context, states: options.states });
  if (options.states.has('s07')) await customPickerState(context);
  if (options.states.has('s12')) await inkedPageState({ ...context, cardinality });
  writeJson(join(dir, 'batch.json'), { ...info, notes, inputs: driver.inputs });
  await driver.terminate();
  return dir;
}

export async function captureParityStates(options) {
  const session = readSessionFile(options.sessionFile);
  const arms = selectArms(readArmsManifest(options.armsFile), options.armTags, session.platform);
  const runtime = runtimeLabel(session.platform, session.device);
  const results = [];
  for (const arm of arms) {
    let cardinality = options.cardinality;
    for (const combo of options.combos) {
      // The webview reference has no Button style, so it has no flat chrome to capture.
      if (arm.kind === 'webview-reference' && combo.style === 'flat') continue;
      const comboKey = `${combo.style}-${combo.theme}-${combo.orientation}`;
      const startedAt = Date.now();
      const dir = join(options.out, options.target, arm.tag, comboKey);
      try {
        await captureBatch({ session, options, arm, combo, runtime, cardinality });
        results.push({ arm: arm.tag, combo: comboKey, ok: true, ms: Date.now() - startedAt });
        cardinality = false;
      } catch (error) {
        console.error(`FAILED ${arm.tag} ${comboKey}: ${error.message}`);
        const failure = { arm: arm.tag, combo: comboKey, ok: false, error: error.message };
        results.push({ ...failure, ms: Date.now() - startedAt });
        await writeFailureEvidence(session, dir);
      }
    }
  }
  await setDeviceOrientation({
    session,
    platform: session.platform,
    device: session.device,
    orientation: 'portrait',
  }).catch(() => {});
  writeJson(join(options.out, options.target, `run-${Date.now()}.json`), results);
  console.log(JSON.stringify(results, null, 1));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
  return results;
}

async function writeFailureEvidence(session, dir) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'failure.png'), screenshot(session.platform, session.device));
    writeFileSync(join(dir, 'failure.xml'), await session.source());
  } catch {
    // Failure evidence is best effort; the failure itself is already in the run summary.
  }
}

if (isMain(import.meta.url)) {
  runMain(() => captureParityStates(parseParityStateFlags(process.argv.slice(2))));
}
