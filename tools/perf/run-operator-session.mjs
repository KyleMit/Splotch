// Guided session for the capture inputs only a human at the devices can give,
// so the rest of a campaign can run unattended (issues 1275 and 1299).
//
//   npm run perf:operator                     everything the attached devices allow
//   npm run perf:operator -- --plan           print the checklist and exit
//   npm run perf:operator -- --steps=grant    just re-arm the iPad automation grant
//
// Three steps, each skippable and each safe to re-run:
//   grant         launch one WebDriverAgent session while the operator watches the
//                 iPad — the "Enter iPad Passcode / Enable UI Automation" prompt only
//                 exists during a launch, never at rest. Every attempt is appended to
//                 a TRACKED grant log so the grant's unknown lifetime can eventually
//                 be established from data (issue 1299).
//   android-hand  real-finger captures inside the installed Android Capacitor WebView
//   ios-hand      the same inside the iPad Capacitor WebView (issue 1275). The app is
//                 launched deterministically through devicectl — never "whatever is
//                 foregrounded", which once put a Safari capture under a WKWebView
//                 label — and the capture tool refuses an artifact whose user agent
//                 contradicts the labelled runtime.
//
// Devices and ports come from the preflight's own resolution (prepareCapture),
// not from a third copy of the port table. Each capture runs `perf:device:hand`
// in a child process, so one failed cell costs that cell rather than the
// session. The rig it brings up — preview, probe host, Appium — is left running
// on purpose (see the start-capture-session skill).
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  ROOT,
  argFlag,
  fail,
  hasCommand,
  isMain,
  parseOrFail,
  run,
  runMain,
} from '../lib/proc.mjs';
import { lanAddresses, waitForUrl } from '../lib/net.mjs';
import { classifyLaunchProbe } from './lib/capture-readiness.mjs';
import { buildDirHoldsNativeExport } from './lib/build-variant.mjs';
import { DEFAULT_PROBE_PORT } from './split-capture/serve-probe-host.mjs';
import { prepareCapture, probeIosLaunch } from './prepare-capture.mjs';

const STEP_NAMES = ['grant', 'android-hand', 'ios-hand'];
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];
const DEFAULT_BRUSHES = ['pen', 'crayon'];
const DEFAULT_DRAW_SECONDS = 25;
const SERVER_READY_TIMEOUT_MS = 90_000;
// One retry, because the expected failure is the operator missing the prompt's
// one-minute window — anything structural repeats identically on attempt two.
const GRANT_MAX_ATTEMPTS = 2;
const OUTPUT_ROOT = join('perf-profiles', 'split-capture', 'hand-native');
const LOG_DIR = join(ROOT, 'perf-profiles', 'operator-logs');
// Tracked (perf-profiles/evidence is the one un-gitignored perf path), because
// this file IS the longitudinal dataset issue 1299 wants: an untracked log is
// one `rm -rf perf-profiles` from erasing the only grant-lifetime evidence.
const GRANT_LOG = join(ROOT, 'perf-profiles', 'evidence', 'operator', 'ipad-grant-log.tsv');

export function operatorSessionPlan({
  steps = STEP_NAMES,
  brushes = DEFAULT_BRUSHES,
  orientations = ['PORTRAIT'],
  theme = 'light',
  androidSerial = null,
  iosUdid = null,
} = {}) {
  for (const step of steps) {
    if (!STEP_NAMES.includes(step)) {
      throw new Error(`unknown step "${step}" — steps are ${STEP_NAMES.join(', ')}`);
    }
  }
  for (const brush of brushes) {
    if (!BRUSHES.includes(brush)) {
      throw new Error(`unknown brush "${brush}" — brushes are ${BRUSHES.join(', ')}`);
    }
  }
  for (const orientation of orientations) {
    if (!ORIENTATIONS.includes(orientation)) {
      throw new Error(`unknown orientation "${orientation}" — use ${ORIENTATIONS.join(', ')}`);
    }
  }
  const items = [];
  if (steps.includes('grant')) {
    items.push({
      step: 'grant',
      device: iosUdid,
      skipped: iosUdid ? null : 'no iPad enumerated (idevice_id -l)',
    });
  }
  const handSteps = [
    [
      'android-hand',
      'android',
      androidSerial,
      androidSerial ? null : 'no Android device attached (adb devices)',
    ],
    ['ios-hand', 'ios', iosUdid, iosUdid ? null : 'no iPad enumerated (idevice_id -l)'],
  ];
  for (const [step, platform, device, skipped] of handSteps) {
    if (!steps.includes(step)) continue;
    for (const orientation of orientations) {
      for (const brush of brushes) {
        items.push({ step, platform, device, brush, orientation, theme, skipped });
      }
    }
  }
  return items;
}

export function handCaptureArgs({
  platform,
  brush,
  orientation,
  theme,
  seconds,
  host,
  device,
  outputDir,
}) {
  const label = `hand-${platform}-native-${brush}-${orientation.toLowerCase()}-${theme}`;
  const output = join(outputDir, `${label}.json`);
  return {
    label,
    output,
    args: [
      join(ROOT, 'tools', 'perf', 'split-capture', 'capture-hand-input.mjs'),
      `--platform=${platform}`,
      '--native-app',
      `--open=${platform === 'android' ? 'adb' : 'devicectl'}`,
      `--host=${host}`,
      `--brush=${brush}`,
      `--orientation=${orientation}`,
      `--theme=${theme}`,
      `--seconds=${seconds}`,
      `--label=${label}`,
      `--output=${output}`,
      platform === 'android' ? `--device-serial=${device}` : `--device-udid=${device}`,
    ],
  };
}

async function urlAnswers(url) {
  return fetch(url, { signal: AbortSignal.timeout(2_000) })
    .then((response) => response.ok)
    .catch(() => false);
}

function spawnDetached(command, args, logName, env = {}) {
  mkdirSync(LOG_DIR, { recursive: true });
  const log = openSync(join(LOG_DIR, logName), 'a');
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', log, log],
    detached: true,
  });
  child.unref();
  return child;
}

async function ensurePreview(port) {
  if (await urlAnswers(`http://127.0.0.1:${port}/`)) {
    console.log(`  preview ${port} — reused`);
    return;
  }
  if (!existsSync(join(ROOT, 'web', 'build')) || buildDirHoldsNativeExport()) {
    console.log('  web/build is missing or holds the native export — running perf:build…');
    run('npm', ['run', 'perf:build']);
  }
  spawnDetached(
    process.execPath,
    [join(ROOT, 'tools', 'perf', 'serve-profile-build.mjs'), `--port=${port}`, '--strict-port'],
    'preview.log',
    { PUBLIC_ENABLE_DEV_HARNESS: 'true' }
  );
  await waitForUrl(`http://127.0.0.1:${port}/`, SERVER_READY_TIMEOUT_MS);
  console.log(`  preview ${port} — started`);
}

async function ensureProbeHost(port, previewPort) {
  if (await urlAnswers(`http://127.0.0.1:${port}/__probe/state`)) {
    console.log(`  probe host ${port} — reused`);
    return;
  }
  spawnDetached(
    process.execPath,
    [
      join(ROOT, 'tools', 'perf', 'split-capture', 'serve-probe-host.mjs'),
      `--port=${port}`,
      `--upstream=http://127.0.0.1:${previewPort}`,
    ],
    'probe-host.log',
    { PUBLIC_ENABLE_DEV_HARNESS: 'true' }
  );
  await waitForUrl(`http://127.0.0.1:${port}/__probe/state`, SERVER_READY_TIMEOUT_MS);
  console.log(`  probe host ${port} — started`);
}

async function ensureAppium(port) {
  if (await urlAnswers(`http://127.0.0.1:${port}/status`)) {
    console.log(`  appium ${port} — reused (the preflight already vetted the holder)`);
    return;
  }
  if (!hasCommand('appium')) fail('appium is not installed — npm install -g appium');
  spawnDetached('appium', ['--port', String(port), '--log-timestamp'], 'appium.log');
  await waitForUrl(`http://127.0.0.1:${port}/status`, SERVER_READY_TIMEOUT_MS);
  console.log(`  appium ${port} — started`);
}

// One row per WDA launch attempt: the only dataset that can ever answer how
// long an automation grant lasts. Values are flattened to single-line fields so
// a multi-sentence Appium message cannot break the TSV.
export function grantLogLine({ timestamp, udid, outcome, detail }) {
  const cell = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  return `${cell(timestamp)}\t${cell(udid)}\t${cell(outcome)}\t${cell(detail)}\n`;
}

function recordGrantAttempt(udid, outcome, detail) {
  mkdirSync(join(ROOT, 'perf-profiles', 'evidence', 'operator'), { recursive: true });
  if (!existsSync(GRANT_LOG)) appendFileSync(GRANT_LOG, 'timestamp\tudid\toutcome\tdetail\n');
  appendFileSync(
    GRANT_LOG,
    grantLogLine({ timestamp: new Date().toISOString(), udid, outcome, detail })
  );
}

async function runGrantStep({ udid, appiumPort, wdaPort, ask }) {
  console.log('\n== iPad automation grant ==');
  console.log('  A WebDriverAgent session is about to launch (~1 minute, it builds WDA).');
  console.log('  WATCH THE IPAD THE WHOLE TIME. If it shows "Enter iPad Passcode for');
  console.log('  XCTest / Enable UI Automation", enter the passcode and allow it — the');
  console.log('  prompt exists only while the launch is running, never at rest.');
  for (let attempt = 1; attempt <= GRANT_MAX_ATTEMPTS; attempt += 1) {
    await ask('  Press Enter when you are watching the iPad… ');
    const probe = classifyLaunchProbe(
      await probeIosLaunch({
        udid,
        appiumUrl: `http://127.0.0.1:${appiumPort}`,
        wdaPort,
        verifyRotation: false,
      })
    );
    recordGrantAttempt(udid, probe.status, probe.detail);
    if (probe.status === 'ok') {
      console.log('  ✓ the iPad accepted an automation session — the grant is armed.');
      console.log(`    Logged to ${GRANT_LOG} (issue 1299 wants this history — commit it).`);
      return { status: 'pass', detail: probe.detail };
    }
    console.log(`  ✗ ${probe.detail}`);
    if (attempt < GRANT_MAX_ATTEMPTS) {
      console.log('  If a prompt is on the iPad now, clear it — then retry.');
    }
  }
  return { status: 'fail', detail: 'the iPad refused an automation session twice' };
}

function announceHandStep(platform) {
  if (platform === 'android') {
    console.log('\n== Android WebView hand captures ==');
    console.log('  The installed profiling build is launched for you over adb. When the');
    console.log('  phone buzzes once, draw with ONE FINGER until it buzzes twice.');
    return;
  }
  console.log('\n== iPad WebView hand captures ==');
  console.log('  Unlock the iPad and leave it alone: the harness relaunches the installed');
  console.log('  Splotch profiling app itself before each capture — do NOT open Safari or');
  console.log('  any URL. Watch this terminal: when it prints READY and starts counting');
  console.log('  down, draw with ONE FINGER until it says done.');
}

// The iPad opener launches the app but drives no rotation — only Android's
// opener applies the requested orientation — so a landscape iOS item depends
// on the OPERATOR holding the device that way, and the capture tool refuses at
// readiness when the page disagrees. Say so before the launch, not in the
// refusal.
export function handItemInstructions(item) {
  if (item.platform !== 'ios' || item.orientation === 'PORTRAIT') return [];
  return [
    `  ROTATE THE IPAD to ${item.orientation.toLowerCase()} now and keep it there`,
    '  (check Control Center that rotation lock is off) — this overrides the',
    '  general leave-it-alone instruction; the harness cannot turn the device,',
    '  and the capture refuses a page whose orientation disagrees with the plan.',
  ];
}

export async function runHandItem(item, { host, seconds, outputDir, ask, spawnChild = spawnSync }) {
  if (!item.device) {
    return { status: 'fail', detail: `the ${item.platform} device disappeared mid-session` };
  }
  const { label, output, args } = handCaptureArgs({ ...item, seconds, host, outputDir });
  console.log(`\n-- ${label} (${seconds}s of drawing) --`);
  for (const line of handItemInstructions(item)) console.log(line);
  await ask('  Press Enter when ready to draw… ');
  const child = spawnChild(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  return child.status === 0
    ? { status: 'pass', detail: output }
    : { status: 'fail', detail: `exit ${child.status} — rerun with --steps=${item.step}` };
}

export async function runOperatorSession() {
  const planOnly = process.argv.includes('--plan');
  // The preflight is the authority on device identity, port resolution, and the
  // Android wake state — the skill's rule is to take its answers rather than
  // re-deriving them. --plan skips it so the checklist works offline.
  const report = planOnly
    ? { androidSerial: null, iosUdid: null, ports: null, ready: true, blockers: [] }
    : await prepareCapture(['--wake-android']);
  const plan = parseOrFail(() =>
    operatorSessionPlan({
      steps: argFlag('steps', STEP_NAMES.join(',')).split(','),
      brushes: argFlag('brushes', DEFAULT_BRUSHES.join(',')).split(','),
      orientations: argFlag('orientations', 'PORTRAIT').split(','),
      theme: argFlag('theme', 'light'),
      androidSerial: planOnly ? 'planned' : report.androidSerial,
      iosUdid: planOnly ? 'planned' : report.iosUdid,
    })
  );

  console.log('\nOperator session — the inputs only a human at the devices can give.\n');
  console.table(
    plan.map(({ step, device, brush, orientation, skipped }) => ({
      step,
      device: skipped ? '' : (device ?? ''),
      brush: brush ?? '',
      orientation: orientation ?? '',
      status: skipped ? `SKIP: ${skipped}` : 'queued',
    }))
  );
  if (planOnly) return plan;
  if (!report.ready) fail(`the preflight is blocking:\n  ${report.blockers.join('\n  ')}`);

  const seconds = Number(argFlag('seconds', DEFAULT_DRAW_SECONDS));
  const lan = lanAddresses()[0];
  if (!lan) fail('no LAN address — the devices cannot reach a probe host on this machine');
  const probePort = Number(argFlag('probe-port', DEFAULT_PROBE_PORT));
  const host = `http://${lan}:${probePort}`;
  const outputDir = join(OUTPUT_ROOT, new Date().toISOString().replaceAll(':', '-'));

  const active = plan.filter((item) => !item.skipped);
  if (active.length === 0) fail('nothing to do — every step is skipped');

  console.log('\nBringing the rig up (reused where already running, left running after):');
  if (active.some((item) => item.step !== 'grant')) {
    await ensurePreview(report.ports.preview);
    await ensureProbeHost(probePort, report.ports.preview);
  }
  if (active.some((item) => item.step === 'grant')) await ensureAppium(report.ports.appium);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => rl.question(question);
  const results = [];
  try {
    let announced = null;
    for (const item of active) {
      if (item.step === 'grant') {
        results.push({
          item,
          ...(await runGrantStep({
            udid: item.device,
            appiumPort: report.ports.appium,
            wdaPort: report.ports.wda,
            ask,
          })),
        });
        continue;
      }
      if (announced !== item.step) {
        announceHandStep(item.platform);
        announced = item.step;
      }
      results.push({ item, ...(await runHandItem(item, { host, seconds, outputDir, ask })) });
    }
  } finally {
    rl.close();
  }

  console.log('\n== Session summary ==');
  console.table(
    results.map(({ item, status, detail }) => ({
      step: item.step,
      brush: item.brush ?? '',
      orientation: item.orientation ?? '',
      status,
      detail,
    }))
  );
  const handPasses = results.filter(({ item, status }) => item.brush && status === 'pass');
  if (handPasses.length) {
    console.log('\nNext steps for the captures:');
    console.log(`  npm run perf:evidence:keep -- --corpus=${outputDir} --campaign=<name>`);
    console.log('  Then post the calibration readings to issue 1275.');
  }
  console.log('\nThe rig stays up. The campaign can continue unattended from here.');
  if (results.some(({ status }) => status === 'fail')) process.exitCode = 1;
  return results;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await runOperatorSession();
  });
}
