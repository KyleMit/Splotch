// Runs one crash scenario N times on one target and arm, relaunching the app before every run.
// Run i uses seed i, so any run replays from its number alone.
import { join } from 'node:path';
import { POSITIVE_INTEGER, isMain, runMain, sleep } from '../lib/proc.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { numberFlag, parseFlags } from './lib/cli-flags.mjs';
import {
  relaunchAndroidApp,
  relaunchIosDeviceApp,
  relaunchSimulatorApp,
} from './lib/device-commands.mjs';
import { CRASH_SCENARIO_FLAGS, crashRunOptions, runCrashScenario } from './run-crash-scenario.mjs';

const RELAUNCH_SETTLE_MS = 4000;
const { run: _run, seed: _seed, ...SHARED_FLAGS } = CRASH_SCENARIO_FLAGS;
const MATRIX_FLAGS = {
  ...SHARED_FLAGS,
  runs: { type: 'string' },
  'first-run': { type: 'string', default: '1' },
};

export function parseCrashMatrixFlags(argv) {
  const { values } = parseFlags(argv, {
    options: MATRIX_FLAGS,
    required: ['session', 'target', 'bundle', 'arm', 'scenario', 'runs', 'out'],
  });
  return {
    ...crashRunOptions(values),
    runs: numberFlag(values, 'runs', POSITIVE_INTEGER),
    firstRun: numberFlag(values, 'first-run', POSITIVE_INTEGER),
    root: values.out,
  };
}

function relaunchApp(target, device, bundleId) {
  if (target === 'ios-simulator') relaunchSimulatorApp(device, bundleId);
  else if (target === 'ios-device') relaunchIosDeviceApp(device, bundleId);
  else relaunchAndroidApp(device, bundleId);
}

export async function runCrashMatrix({ runs, firstRun, root, ...options }) {
  const { device } = readSessionFile(options.sessionFile);
  const out = join(root, options.target);
  const completed = [];
  const failed = [];
  for (let run = firstRun; run < firstRun + runs; run += 1) {
    try {
      relaunchApp(options.target, device, options.bundleId);
      await sleep(RELAUNCH_SETTLE_MS);
      const result = await runCrashScenario({ ...options, run, seed: run, out });
      completed.push({ run, verdict: result.verdict, scenarioError: result.scenarioError });
    } catch (error) {
      failed.push({ run, error: error.message });
      console.error(`run ${run} failed: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ out, completed, failed }, null, 1));
  if (failed.length) process.exitCode = 1;
  return { completed, failed };
}

if (isMain(import.meta.url)) {
  runMain(() => runCrashMatrix(parseCrashMatrixFlags(process.argv.slice(2))));
}
