// One crash-hunt stress run with a machine verdict: alive, crashed, or error-screened.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSITIVE_INTEGER, fail, isMain, runMain } from '../lib/proc.mjs';
import { queryAppState } from './lib/app-foreground.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { choiceFlag, numberFlag, parseFlags } from './lib/cli-flags.mjs';
import { CRASH_SCENARIOS, CRASH_SCENARIO_NAMES } from './lib/crash-scenarios.mjs';
import {
  CRASH_TARGETS,
  CRASH_TARGET_NAMES,
  assertSessionMatchesTarget,
} from './lib/crash-targets.mjs';
import {
  androidNow,
  androidVerdict,
  ipadCrashList,
  ipadExitRecords,
  ipadNewReports,
  ipadVerdict,
  simVerdict,
} from './lib/crash-verdict.mjs';
import { createScenarioDriver, shortError } from './lib/scenario-driver.mjs';

const SCENARIO_ERROR_CHARS = 300;
const PLAIN_NAME = /^[\w.-]+$/;

export const CRASH_SCENARIO_FLAGS = {
  session: { type: 'string' },
  target: { type: 'string' },
  bundle: { type: 'string' },
  arm: { type: 'string' },
  scenario: { type: 'string' },
  run: { type: 'string', default: '1' },
  seed: { type: 'string', default: '1' },
  out: { type: 'string' },
  strokes: { type: 'string' },
  'process-name': { type: 'string' },
  'collect-log': { type: 'boolean', default: false },
};
const REQUIRED = ['session', 'target', 'bundle', 'arm', 'scenario', 'out'];

// Shared with run-crash-matrix, which owns run and seed itself.
export function crashRunOptions(values) {
  const target = choiceFlag(values, 'target', CRASH_TARGET_NAMES);
  const processName = values['process-name'];
  if (CRASH_TARGETS[target].platform === 'ios' && !processName) {
    fail(`--target=${target} needs --process-name=<the app's iOS process name>`);
  }
  if (processName !== undefined && !PLAIN_NAME.test(processName)) {
    fail(`--process-name must be a plain process name, got "${processName}"`);
  }
  // The arm names every result file.
  if (!PLAIN_NAME.test(values.arm)) fail(`--arm must be a plain label, got "${values.arm}"`);
  if (values['collect-log'] && target !== 'ios-device') {
    fail('--collect-log reads a physical iPad’s unified log; it applies to --target=ios-device');
  }
  return {
    sessionFile: values.session,
    target,
    bundleId: values.bundle,
    arm: values.arm,
    scenario: choiceFlag(values, 'scenario', CRASH_SCENARIO_NAMES),
    strokes: numberFlag(values, 'strokes', POSITIVE_INTEGER),
    processName,
    collectLog: values['collect-log'],
  };
}

export function parseCrashScenarioFlags(argv) {
  const { values } = parseFlags(argv, { options: CRASH_SCENARIO_FLAGS, required: REQUIRED });
  return {
    ...crashRunOptions(values),
    run: numberFlag(values, 'run', POSITIVE_INTEGER),
    seed: numberFlag(values, 'seed', POSITIVE_INTEGER),
    out: values.out,
  };
}

async function readSource(session) {
  try {
    return await session.source();
  } catch {
    return '';
  }
}

async function ipadDeviceVerdict({ session, options, before, source, label, startMs }) {
  let appState;
  try {
    appState = await queryAppState(session, options.bundleId);
  } catch (error) {
    appState = `query failed: ${shortError(error)}`;
  }
  const newReports = ipadNewReports(session.device, before, options.processName);
  const verdict = ipadVerdict({ appState, newReports, source });
  if (!options.collectLog) return verdict;
  const exitRecords = ipadExitRecords({
    udid: session.device,
    bundleId: options.bundleId,
    archive: join(options.out, `${label}.logarchive`),
    startMs,
    endMs: Date.now(),
  });
  return { ...verdict, exitRecords };
}

function runVerdict({ session, options, startStamp, startMs, source, ...ipad }) {
  if (options.target === 'ios-simulator') {
    return simVerdict({
      udid: session.device,
      bundleId: options.bundleId,
      processName: options.processName,
      sinceMs: startMs,
      source,
    });
  }
  if (options.target === 'ios-device') {
    return ipadDeviceVerdict({ session, options, source, startMs, ...ipad });
  }
  return androidVerdict({
    serial: session.device,
    pkg: options.bundleId,
    startStamp,
    sinceMs: startMs,
    source,
  });
}

export async function runCrashScenario(options) {
  const session = readSessionFile(options.sessionFile);
  assertSessionMatchesTarget(session, options.target);
  const label = `${options.scenario}-${options.arm}-${options.run}`;
  mkdirSync(options.out, { recursive: true });
  const driver = createScenarioDriver({
    session,
    target: options.target,
    bundleId: options.bundleId,
    out: options.out,
    label,
    seed: options.seed,
    run: options.run,
  });
  // A hosted system view service can take XCUITest's active-app slot; pin queries to the app.
  if (driver.ios) {
    await session
      .request('POST', '/appium/settings', {
        settings: { defaultActiveApplication: options.bundleId },
      })
      .catch((error) => driver.note(`defaultActiveApplication: ${shortError(error)}`));
  }
  await driver.assertForeground();
  await driver.refreshWindow();
  const startMs = Date.now();
  const before = options.target === 'ios-device' ? ipadCrashList(session.device) : null;
  const startStamp = driver.ios ? null : androidNow(session.device);
  const memStart = driver.memoryMb();
  let scenarioError = null;
  try {
    await CRASH_SCENARIOS[options.scenario](driver, { strokes: options.strokes });
  } catch (error) {
    scenarioError = String(error.message).slice(0, SCENARIO_ERROR_CHARS);
  }
  const memEnd = driver.memoryMb();
  driver.shot('end');
  const source = await readSource(session);
  const verdict = await runVerdict({
    session,
    options,
    startStamp,
    startMs,
    source,
    before,
    label,
  });
  const result = {
    label,
    scenario: options.scenario,
    target: options.target,
    arm: options.arm,
    bundle: options.bundleId,
    run: options.run,
    seed: options.seed,
    startedAt: new Date(startMs).toISOString(),
    durationMs: Date.now() - startMs,
    scenarioError,
    memStart,
    memEnd,
    notes: driver.notes,
    ...verdict,
  };
  writeFileSync(join(options.out, `${label}.json`), JSON.stringify(result, null, 2));
  const summary = { verdict: result.verdict, scenarioError, memStart, memEnd };
  console.log(new Date().toISOString().slice(11, 23), label, JSON.stringify(summary));
  return result;
}

if (isMain(import.meta.url)) {
  runMain(() => runCrashScenario(parseCrashScenarioFlags(process.argv.slice(2))));
}
