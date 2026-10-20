// Scenario S3 on the Android emulator: one `adb shell monkey` seed against one app, with the
// machine verdict. System keys, navigation, and app switching are held at zero so the monkey stays
// inside the app and never sends Back.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADB } from '../mobile/android/lib/android-toolchain.mjs';
import { POSITIVE_INTEGER, fail, isMain, runMain, sleep } from '../lib/proc.mjs';
import { readSessionFile } from './lib/appium-session.mjs';
import { numberFlag, parseFlags } from './lib/cli-flags.mjs';
import { androidNow, androidPssMb, androidVerdict } from './lib/crash-verdict.mjs';
import { relaunchAndroidApp } from './lib/device-commands.mjs';

const LAUNCH_SETTLE_MS = 5000;
const AFTER_MONKEY_SETTLE_MS = 4000;
const MONKEY_THROTTLE_MS = 40;
const MONKEY_TIMEOUT_MS = 20 * 60 * 1000;
const MONKEY_OUTPUT_LIMIT_BYTES = 64 << 20;
const MONKEY_TAIL_LINES = 6;
const MONKEY_REPORTED = /\/\/ (CRASH|NOT RESPONDING)|Monkey aborted/;

const FLAGS = {
  session: { type: 'string' },
  bundle: { type: 'string' },
  arm: { type: 'string' },
  seed: { type: 'string' },
  out: { type: 'string' },
  events: { type: 'string', default: '3000' },
};

export function parseMonkeySeedFlags(argv) {
  const { values } = parseFlags(argv, {
    options: FLAGS,
    required: ['session', 'bundle', 'arm', 'seed', 'out'],
  });
  return {
    sessionFile: values.session,
    bundleId: values.bundle,
    arm: values.arm,
    seed: numberFlag(values, 'seed', POSITIVE_INTEGER),
    events: numberFlag(values, 'events', POSITIVE_INTEGER),
    out: values.out,
  };
}

function runMonkey(serial, { bundleId, seed, events }) {
  const args = ['-s', serial, 'shell', 'monkey', '-p', bundleId, '-s', String(seed)];
  args.push('--throttle', String(MONKEY_THROTTLE_MS));
  for (const kind of ['syskeys', 'nav', 'majornav', 'appswitch']) args.push(`--pct-${kind}`, '0');
  args.push('-v', String(events));
  try {
    const output = execFileSync(ADB, args, {
      encoding: 'utf8',
      maxBuffer: MONKEY_OUTPUT_LIMIT_BYTES,
      timeout: MONKEY_TIMEOUT_MS,
    });
    return { output, exit: 0 };
  } catch (error) {
    return { output: `${error.stdout ?? ''}${error.stderr ?? ''}`, exit: error.status ?? 1 };
  }
}

export async function runMonkeySeed(options) {
  const session = readSessionFile(options.sessionFile);
  if (session.platform !== 'android') fail('run-monkey-seed needs an Android emulator session');
  const serial = session.device;
  const label = `S3-${options.arm}-${options.seed}`;
  mkdirSync(options.out, { recursive: true });
  relaunchAndroidApp(serial, options.bundleId);
  await sleep(LAUNCH_SETTLE_MS);
  const startMs = Date.now();
  const startStamp = androidNow(serial);
  const memStart = androidPssMb(serial, options.bundleId);
  const monkey = runMonkey(serial, options);
  await sleep(AFTER_MONKEY_SETTLE_MS);
  const source = await session.source().catch(() => '');
  const reported = monkey.output.split('\n').filter((line) => MONKEY_REPORTED.test(line));
  const verdict = androidVerdict({
    serial,
    pkg: options.bundleId,
    startStamp,
    sinceMs: startMs,
    source,
  });
  if (reported.length && verdict.verdict === 'alive') verdict.verdict = 'crashed';
  const result = {
    label,
    scenario: 'S3',
    target: 'android-emulator',
    arm: options.arm,
    bundle: options.bundleId,
    seed: options.seed,
    events: options.events,
    startedAt: new Date(startMs).toISOString(),
    durationMs: Date.now() - startMs,
    scenarioError: null,
    monkeyExit: monkey.exit,
    monkeyTail: monkey.output.split('\n').slice(-MONKEY_TAIL_LINES),
    monkeyReported: reported,
    memStart,
    ...verdict,
  };
  writeFileSync(join(options.out, `${label}.json`), JSON.stringify(result, null, 2));
  const summary = { verdict: result.verdict, monkeyExit: monkey.exit, reported: reported.length };
  console.log(new Date().toISOString().slice(11, 23), label, JSON.stringify(summary));
  return result;
}

if (isMain(import.meta.url)) {
  runMain(() => runMonkeySeed(parseMonkeySeedFlags(process.argv.slice(2))));
}
