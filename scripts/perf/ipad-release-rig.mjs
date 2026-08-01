import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, capture, isMain, runMain } from '../lib/proc.mjs';
import { runIpadFrames } from './ipad-frames.mjs';
import { runIpadProfile } from './ipad.mjs';
import { profilePath } from './paths.mjs';
import {
  IPAD_RELEASE_SUITES,
  MIN_RELEASE_RIG_REPEATS,
  validateReleaseRigInputs,
  writeReleaseRigReport,
} from './ipad-release-report.mjs';

const BUILD_METADATA_PATH = join(ROOT, 'web', 'build', 'version.json');

function runChecked(command, args, options = {}) {
  console.log('$', command, ...args);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 'without a status'}`);
  }
}

export function releaseRigPlan({ suite, repeats, deviceId, deviceModel, outputDir }) {
  const { scenarios } = validateReleaseRigInputs({ suite, repeats });
  if (!deviceId) throw new Error('--device-id is required; simulator substitution is forbidden');
  if (!deviceModel) throw new Error('--device-model is required for durable result provenance');
  return {
    suite,
    repeats,
    scenarios,
    deviceId,
    deviceModel,
    outputDir,
    realScreenRepeats: suite === 'full' ? repeats : 0,
  };
}

function readBuildMetadata() {
  const build = JSON.parse(readFileSync(BUILD_METADATA_PATH, 'utf8'));
  if (!build.version || !build.buildTime) {
    throw new Error(
      `${BUILD_METADATA_PATH} lacks version/buildTime; refusing an unverifiable profiling bundle`
    );
  }
  return { appVersion: build.version, buildTime: build.buildTime };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export async function runIpadReleaseRig(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      suite: { type: 'string', default: 'fast' },
      repeats: { type: 'string', default: String(MIN_RELEASE_RIG_REPEATS) },
      'device-id': { type: 'string' },
      'device-model': { type: 'string' },
      output: { type: 'string' },
      'release-tag': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const outputDir = resolve(
    values.output ?? join(profilePath('ipad-release-rig', values.suite), 'report')
  );
  const plan = releaseRigPlan({
    suite: values.suite,
    repeats: Number(values.repeats),
    deviceId: values['device-id'],
    deviceModel: values['device-model'],
    outputDir,
  });

  if (values['dry-run']) {
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }
  if (process.platform !== 'darwin') {
    throw new Error('The physical-iPad release rig requires macOS');
  }

  runChecked('npm', ['run', 'perf:build'], {
    env: { ...process.env, PERF_MARKS: 'true', PUBLIC_ENABLE_DEV_HARNESS: 'true' },
  });
  const build = readBuildMetadata();
  const common = [
    `--device-id=${plan.deviceId}`,
    `--expected-app-version=${build.appVersion}`,
    `--expected-build-time=${build.buildTime}`,
  ];
  const rawDir = join(dirname(outputDir), 'raw');
  mkdirSync(rawDir, { recursive: true });

  const engineRuns = [];
  for (let repeat = 1; repeat <= plan.repeats; repeat++) {
    console.log(`\nEngine gates repeat ${repeat}/${plan.repeats}`);
    const output = join(rawDir, `engine-${repeat}`, 'ipad-gates.json');
    await runIpadProfile([
      ...common,
      `--scenarios=${plan.scenarios.join(',')}`,
      `--output=${output}`,
    ]);
    engineRuns.push(readJson(output));
  }

  const frameRuns = [];
  for (let repeat = 1; repeat <= plan.realScreenRepeats; repeat++) {
    console.log(`\nReal-screen repeat ${repeat}/${plan.realScreenRepeats}`);
    const output = join(rawDir, `frames-${repeat}`, 'real-screen.json');
    await runIpadFrames([...common, '--drive', '--no-hud', `--output=${output}`]);
    frameRuns.push(readJson(output));
  }

  const first = engineRuns[0];
  const metadata = {
    capturedAt: new Date().toISOString(),
    suite: plan.suite,
    repeats: plan.repeats,
    appVersion: build.appVersion,
    buildTime: build.buildTime,
    commit: capture('git', ['rev-parse', 'HEAD']).trim(),
    releaseTag: values['release-tag'],
    device: { ...first.device, model: plan.deviceModel },
  };
  const report = writeReleaseRigReport({ metadata, engineRuns, frameRuns }, outputDir);
  console.log(`\nRelease-rig report: ${join(outputDir, 'index.html')}`);
  return { outputDir, report };
}

if (isMain(import.meta.url)) runMain(runIpadReleaseRig);

export { IPAD_RELEASE_SUITES };
