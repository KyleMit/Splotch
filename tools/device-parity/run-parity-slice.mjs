// DS-2 and the slices built on it (KEY-1, LIFE-1, LIFE-1 Android Back, SAVE-1, font scale): each
// step is screen-recorded from before its first input until the settle rule holds, then its end
// state is captured, for each arm on one iOS simulator or Android emulator. A step writes
// <id>.mp4, <id>.png, <id>.xml, and an <id>.json sidecar with its inputs and motion bursts under
// <out>/<target>/<arm>/raised-light-portrait-<motion>/.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSITIVE_NUMBER, fail, isMain, runMain, sleep } from '../lib/proc.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { choiceFlag, numberFlag, parseFlags } from './lib/cli-flags.mjs';
import { screenshot, simctl } from './lib/device-commands.mjs';
import { motionTimeline } from './lib/motion-timeline.mjs';
import { readArmsManifest, selectArms } from './lib/parity-arms.mjs';
import { createParityDriver } from './lib/parity-driver.mjs';
import { freshInstall, runtimeLabel, setAppearance } from './lib/parity-lifecycle.mjs';
import { PARITY_SLICES, PARITY_SLICE_NAMES } from './lib/parity-slices.mjs';
import { startScreenRecording } from './lib/screen-recording.mjs';
import { settleCapture } from './lib/settle-capture.mjs';

const LAUNCH_WAIT_MS = 40_000;
const THEME_SETTLE_MS = 800;
const LAUNCH_SETTLE_MS = 2000;
const ZIGZAG_SAMPLES = 60;

const FLAGS = {
  session: { type: 'string' },
  target: { type: 'string' },
  'arms-file': { type: 'string' },
  arms: { type: 'string' },
  slice: { type: 'string', default: 'ds2' },
  steps: { type: 'string' },
  density: { type: 'string', default: '1' },
  // The OS reduce-motion setting the batch runs under, set before the run; it labels the batch.
  motion: { type: 'string', default: 'full' },
  out: { type: 'string' },
};

export function parseParitySliceFlags(argv) {
  const { values } = parseFlags(argv, {
    options: FLAGS,
    required: ['session', 'target', 'arms-file', 'arms', 'out'],
  });
  const slice = choiceFlag(values, 'slice', PARITY_SLICE_NAMES);
  const stepIds = values.steps?.split(',').filter(Boolean) ?? null;
  const known = PARITY_SLICES[slice].steps.map((step) => step.id);
  const unknown = stepIds?.filter((id) => !known.includes(id)) ?? [];
  if (unknown.length) fail(`--steps names no ${slice} step: ${unknown.join(', ')}`);
  return {
    sessionFile: values.session,
    target: values.target,
    armsFile: values['arms-file'],
    armTags: values.arms.split(',').filter(Boolean),
    slice,
    stepIds: stepIds && new Set(stepIds),
    density: numberFlag(values, 'density', POSITIVE_NUMBER),
    motion: choiceFlag(values, 'motion', ['full', 'reduced']),
    out: values.out,
  };
}

// The DS-1 zigzag at height y, normalized to the paper.
function zigzag(y = 0.3) {
  return Array.from({ length: ZIGZAG_SAMPLES }, (_, i) => {
    const t = i / (ZIGZAG_SAMPLES - 1);
    const phase = (t * 6) % 1;
    const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    return [0.15 + 0.7 * t, y - 0.05 + 0.1 * tri];
  });
}

function stepContext({ session, driver, arm, notes }) {
  let paper = null;
  return {
    ios: driver.ios,
    sleep,
    nodes: driver.nodes,
    findName: driver.findName,
    waitFor: driver.waitFor,
    nameFor: driver.nameFor,
    tap: driver.tap,
    tapPoint: driver.tapPoint,
    multiTap: driver.multiTap,
    drag: driver.drag,
    keys: driver.keys,
    hid: driver.hid,
    back: driver.back,
    foregroundPackage: driver.foregroundPackage,
    launch: driver.launch,
    terminate: driver.terminate,
    stroke: (path) => driver.strokePath(paper, path),
    zigzag,
    note: (text) => notes.push(text),
    // Photos add access for the arm under test; changing it terminates the app.
    privacy: (action) => simctl('privacy', session.device, action, 'photos-add', arm.bundleId),
    setPaper: (frame) => {
      paper = frame;
    },
    get paper() {
      return paper;
    },
  };
}

function createStepRecorder({ session, driver, dir, info }) {
  const shot = () => screenshot(session.platform, session.device);
  return async function recordStep(id, action) {
    const video = join(dir, `${id}.mp4`);
    const recording = await startScreenRecording({
      platform: session.platform,
      device: session.device,
      file: video,
    });
    const before = driver.inputs.length;
    let error = null;
    let settle;
    let xml;
    try {
      let last = Date.now();
      try {
        last = (await action()) ?? Date.now();
      } catch (caught) {
        error = caught.message;
      }
      settle = await settleCapture(shot, join(dir, `${id}.png`), last);
      xml = await session.source();
      writeFileSync(join(dir, `${id}.xml`), xml);
    } finally {
      await recording.stop();
    }
    let motion;
    try {
      motion = existsSync(video) && statSync(video).size > 0 ? motionTimeline(video) : null;
    } catch (caught) {
      motion = { error: caught.message };
    }
    const inputs = driver.inputs.slice(before).map((input) => ({
      ...input,
      atS: Math.round((input.t - recording.startedAt) / 10) / 100,
    }));
    const record = {
      id,
      error,
      inputs,
      recordingStartedAt: recording.startedAt,
      settle,
      frames: driver.framesOf(xml),
      motion,
    };
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...info, ...record }, null, 2));
    const bursts = motion?.bursts?.map((burst) => [burst.start, burst.spanMs]) ?? motion;
    const failed = error ? ` ERROR ${error}` : '';
    console.log(`  ${id}${failed} settled=${settle.settled} bursts=${JSON.stringify(bursts)}`);
    return record;
  };
}

// Every step before the last named one still runs, unrecorded, because each arm starts from a
// fresh install and a named step needs the state the steps before it build.
function plannedSteps(steps, stepIds) {
  if (!stepIds) return steps;
  return steps.slice(0, steps.findLastIndex((step) => stepIds.has(step.id)) + 1);
}

async function runSteps({ steps, stepIds, context, recordStep }) {
  const results = [];
  for (const step of plannedSteps(steps, stepIds)) {
    if (step.setup) await step.setup(context);
    if (!stepIds || stepIds.has(step.id)) {
      results.push(await recordStep(step.id, () => step.run(context)));
    } else {
      await step.run(context);
    }
    if (step.after) await step.after(context);
  }
  return results;
}

async function runArm({ session, options, arm, runtime }) {
  const { platform, device } = session;
  const slice = PARITY_SLICES[options.slice];
  const dir = join(options.out, options.target, arm.tag, `raised-light-portrait-${options.motion}`);
  mkdirSync(dir, { recursive: true });
  const notes = [];
  const driver = createParityDriver({
    session,
    arm,
    density: options.density,
    allowSystemBack: slice.usesSystemBack,
    onNote: (text) => notes.includes(text) || notes.push(text),
  });
  const info = {
    target: options.target,
    slice: options.slice,
    arm: arm.tag,
    kind: arm.kind,
    bundleId: arm.bundleId,
    sourceSha: arm.sourceSha,
    artifactSha256: arm[platform].digest,
    runtime,
    axes: { style: 'raised', theme: 'light', orientation: 'portrait', motion: options.motion },
  };
  console.log(`batch ${options.target} ${arm.tag} ${options.slice} ${options.motion}`);
  await session.setOrientation('PORTRAIT').catch(() => {});
  freshInstall({ platform, device, arm });
  setAppearance({ platform, device, theme: 'light' });
  await sleep(THEME_SETTLE_MS);
  await driver.launch();
  const settings = () => driver.findName(driver.nameFor('Settings'));
  const notice = () => driver.findName('Got it');
  await driver.waitFor(
    async () => [...(await notice()), ...(await settings())],
    'Settings',
    LAUNCH_WAIT_MS
  );
  await driver.dismissImmersiveNotice({ waitFirst: false });
  await driver.waitFor(settings, 'Settings', LAUNCH_WAIT_MS);
  await sleep(LAUNCH_SETTLE_MS);

  const context = stepContext({ session, driver, arm, notes });
  const recordStep = createStepRecorder({ session, driver, dir, info });
  const results = await runSteps({
    steps: slice.steps,
    stepIds: options.stepIds,
    context,
    recordStep,
  });
  const steps = results.map((result) => ({
    id: result.id,
    error: result.error,
    settled: result.settle.settled,
    bursts: result.motion?.bursts,
  }));
  writeFileSync(
    join(dir, 'batch.json'),
    JSON.stringify({ ...info, inputs: driver.inputs, notes, steps }, null, 2)
  );
  await driver.terminate();
  return steps.filter((step) => step.error).map(({ id, error }) => ({ id, error }));
}

export async function runParitySlice(options) {
  const session = readSessionFile(options.sessionFile);
  if (!PARITY_SLICES[options.slice].platforms.includes(session.platform)) {
    fail(`slice ${options.slice} does not run on ${session.platform}`);
  }
  const arms = selectArms(readArmsManifest(options.armsFile), options.armTags, session.platform);
  const runtime = runtimeLabel(session.platform, session.device);
  const failed = [];
  for (const arm of arms) {
    try {
      const stepErrors = await runArm({ session, options, arm, runtime });
      if (stepErrors.length) {
        const error = stepErrors.map((step) => `${step.id}: ${step.error}`).join('; ');
        console.error(`FAILED ${arm.tag}: ${error}`);
        failed.push({ arm: arm.tag, error });
      }
    } catch (error) {
      console.error(`FAILED ${arm.tag}: ${error.message}`);
      failed.push({ arm: arm.tag, error: error.message });
      const dir = join(
        options.out,
        options.target,
        arm.tag,
        `raised-light-portrait-${options.motion}`
      );
      try {
        writeFileSync(join(dir, 'failure.png'), screenshot(session.platform, session.device));
        writeFileSync(join(dir, 'failure.xml'), await session.source());
      } catch {
        // Failure evidence is best effort; the failure itself is already reported.
      }
    }
  }
  if (failed.length) process.exitCode = 1;
  return failed;
}

if (isMain(import.meta.url)) {
  runMain(() => runParitySlice(parseParitySliceFlags(process.argv.slice(2))));
}
