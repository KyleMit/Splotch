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
//                 a grant log so the grant's unknown lifetime can eventually be
//                 established from data (issue 1299).
//   android-hand  real-finger captures inside the installed Android Capacitor WebView
//   ios-hand      the same inside the iPad Capacitor WebView (issue 1275)
//
// Each capture runs `perf:device:hand` in a child process, so one failed cell
// costs that cell rather than the session. The rig it brings up — preview, probe
// host, Appium — is left running on purpose (see the start-capture-session skill).
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
import { foreignPortListeners } from '../lib/vite-server.mjs';
import { classifyLaunchProbe } from './lib/capture-readiness.mjs';
import { buildDirHoldsNativeExport } from './lib/build-variant.mjs';
import { probeIosLaunch } from './prepare-capture.mjs';

const STEP_NAMES = ['grant', 'android-hand', 'ios-hand'];
const BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];
const ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'];
const DEFAULT_BRUSHES = ['pen', 'crayon'];
const DEFAULT_DRAW_SECONDS = 25;
const PREVIEW_PORT = 4173;
const PROBE_PORT = 4175;
const APPIUM_PORT = 4723;
const WDA_PORT = 8100;
const SERVER_READY_TIMEOUT_MS = 90_000;
// One retry, because the expected failure is the operator missing the prompt's
// one-minute window — anything structural repeats identically on attempt two.
const GRANT_MAX_ATTEMPTS = 2;
const OUTPUT_DIR = join('perf-profiles', 'split-capture', 'hand-native');
const LOG_DIR = join(ROOT, 'perf-profiles', 'operator-logs');
const GRANT_LOG = join(LOG_DIR, 'ipad-grant-log.tsv');

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
      skipped: iosUdid ? null : 'no iPad enumerated (idevice_id -l)',
    });
  }
  const handSteps = [
    ['android-hand', 'android', androidSerial ? null : 'no Android device attached (adb devices)'],
    ['ios-hand', 'ios', iosUdid ? null : 'no iPad enumerated (idevice_id -l)'],
  ];
  for (const [step, platform, skipped] of handSteps) {
    if (!steps.includes(step)) continue;
    for (const orientation of orientations) {
      for (const brush of brushes) {
        items.push({ step, platform, brush, orientation, theme, skipped });
      }
    }
  }
  return items;
}

export function handCaptureArgs({ platform, brush, orientation, theme, seconds, host, serial }) {
  const label = `hand-${platform}-native-${brush}-${orientation.toLowerCase()}-${theme}`;
  return {
    label,
    output: join(OUTPUT_DIR, `${label}.json`),
    args: [
      join(ROOT, 'tools', 'perf', 'split-capture', 'capture-hand-input.mjs'),
      `--platform=${platform}`,
      '--native-app',
      `--open=${platform === 'android' ? 'adb' : 'manual'}`,
      `--host=${host}`,
      `--brush=${brush}`,
      `--orientation=${orientation}`,
      `--theme=${theme}`,
      `--seconds=${seconds}`,
      `--label=${label}`,
      `--output=${join(OUTPUT_DIR, `${label}.json`)}`,
      ...(platform === 'android' ? [`--device-serial=${serial}`] : []),
    ],
  };
}

function firstLine(command, args) {
  const out = spawnSync(command, args, { encoding: 'utf8' });
  if (out.error || out.status !== 0) return null;
  return out.stdout.split('\n').map((line) => line.trim())[0] || null;
}

function detectAndroidSerial() {
  const out = spawnSync('adb', ['devices'], { encoding: 'utf8' });
  if (out.error) return null;
  const row = out.stdout
    .split('\n')
    .slice(1)
    .find((line) => line.trim().endsWith('device'));
  return row ? row.split('\t')[0].trim() : null;
}

const detectIosUdid = () => (hasCommand('idevice_id') ? firstLine('idevice_id', ['-l']) : null);

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

function refuseForeignListener(port, role) {
  const foreign = foreignPortListeners(port, ROOT);
  if (foreign.length) {
    fail(
      `port ${port} (${role}) is held by a listener outside this checkout (pid ${foreign.join(', ')}). ` +
        'Capturing against it would measure a different product — stop it yourself or serve elsewhere.'
    );
  }
}

async function ensurePreview() {
  if (await urlAnswers(`http://127.0.0.1:${PREVIEW_PORT}/`)) {
    refuseForeignListener(PREVIEW_PORT, 'preview');
    console.log(`  preview ${PREVIEW_PORT} — reused`);
    return;
  }
  if (!existsSync(join(ROOT, 'web', 'build')) || buildDirHoldsNativeExport()) {
    console.log('  web/build is missing or holds the native export — running perf:build…');
    run('npm', ['run', 'perf:build']);
  }
  spawnDetached(
    process.execPath,
    [join(ROOT, 'tools', 'perf', 'serve-profile-build.mjs'), '--strict-port'],
    'preview.log',
    { PUBLIC_ENABLE_DEV_HARNESS: 'true' }
  );
  await waitForUrl(`http://127.0.0.1:${PREVIEW_PORT}/`, SERVER_READY_TIMEOUT_MS);
  console.log(`  preview ${PREVIEW_PORT} — started`);
}

async function ensureProbeHost() {
  if (await urlAnswers(`http://127.0.0.1:${PROBE_PORT}/__probe/state`)) {
    refuseForeignListener(PROBE_PORT, 'probe host');
    console.log(`  probe host ${PROBE_PORT} — reused`);
    return;
  }
  spawnDetached(
    process.execPath,
    [join(ROOT, 'tools', 'perf', 'split-capture', 'serve-probe-host.mjs')],
    'probe-host.log',
    { PUBLIC_ENABLE_DEV_HARNESS: 'true' }
  );
  await waitForUrl(`http://127.0.0.1:${PROBE_PORT}/__probe/state`, SERVER_READY_TIMEOUT_MS);
  console.log(`  probe host ${PROBE_PORT} — started`);
}

async function ensureAppium() {
  if (await urlAnswers(`http://127.0.0.1:${APPIUM_PORT}/status`)) {
    console.log(`  appium ${APPIUM_PORT} — reused`);
    return;
  }
  spawnDetached('appium', ['--port', String(APPIUM_PORT), '--log-timestamp'], 'appium.log');
  await waitForUrl(`http://127.0.0.1:${APPIUM_PORT}/status`, SERVER_READY_TIMEOUT_MS);
  console.log(`  appium ${APPIUM_PORT} — started`);
}

function recordGrantAttempt(outcome, detail) {
  mkdirSync(LOG_DIR, { recursive: true });
  if (!existsSync(GRANT_LOG)) appendFileSync(GRANT_LOG, 'timestamp\toutcome\tdetail\n');
  appendFileSync(GRANT_LOG, `${new Date().toISOString()}\t${outcome}\t${detail}\n`);
}

async function runGrantStep({ udid, ask }) {
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
        appiumUrl: `http://127.0.0.1:${APPIUM_PORT}`,
        wdaPort: WDA_PORT,
        verifyRotation: false,
      })
    );
    recordGrantAttempt(probe.status, probe.detail);
    if (probe.status === 'ok') {
      console.log('  ✓ the iPad accepted an automation session — the grant is armed.');
      console.log(`    Logged to ${GRANT_LOG} (issue 1299 wants this history).`);
      return { status: 'pass', detail: probe.detail };
    }
    console.log(`  ✗ ${probe.detail}`);
    if (attempt < GRANT_MAX_ATTEMPTS) {
      console.log('  If a prompt is on the iPad now, clear it — then retry.');
    }
  }
  return { status: 'fail', detail: 'the iPad refused an automation session twice' };
}

function announceHandStep(platform, host) {
  if (platform === 'android') {
    console.log('\n== Android WebView hand captures ==');
    console.log('  The installed profiling build is launched for you over adb. When the');
    console.log('  phone buzzes once, draw with ONE FINGER until it buzzes twice.');
    return;
  }
  console.log('\n== iPad WebView hand captures ==');
  console.log('  Unlock the iPad and open the profiling Splotch app (the install whose');
  console.log(`  server.url points at ${host}). Ignore the "open this URL" line the tool`);
  console.log('  prints — for a native capture the app IS the page. If no capture starts');
  console.log('  within a minute, the installed build predates this rig: rebuild per');
  console.log('  docs/PROFILING-CAMPAIGNS.md and the start-capture-session skill.');
}

async function runHandItem(item, { host, serial, seconds, ask }) {
  const { label, output, args } = handCaptureArgs({ ...item, seconds, host, serial });
  console.log(`\n-- ${label} (${seconds}s of drawing) --`);
  await ask('  Press Enter when ready to draw… ');
  const child = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  return child.status === 0
    ? { status: 'pass', detail: output }
    : { status: 'fail', detail: `exit ${child.status} — rerun with --steps=${item.step}` };
}

export async function runOperatorSession() {
  const plan = parseOrFail(() =>
    operatorSessionPlan({
      steps: argFlag('steps', STEP_NAMES.join(',')).split(','),
      brushes: argFlag('brushes', DEFAULT_BRUSHES.join(',')).split(','),
      orientations: argFlag('orientations', 'PORTRAIT').split(','),
      theme: argFlag('theme', 'light'),
      androidSerial: detectAndroidSerial(),
      iosUdid: detectIosUdid(),
    })
  );
  const seconds = Number(argFlag('seconds', DEFAULT_DRAW_SECONDS));
  const lan = lanAddresses()[0];
  if (!lan) fail('no LAN address — the devices cannot reach a probe host on this machine');
  const host = `http://${lan}:${PROBE_PORT}`;

  console.log('Operator session — the inputs only a human at the devices can give.\n');
  console.table(
    plan.map(({ step, brush, orientation, skipped }) => ({
      step,
      brush: brush ?? '',
      orientation: orientation ?? '',
      status: skipped ? `SKIP: ${skipped}` : 'queued',
    }))
  );
  if (process.argv.includes('--plan')) return plan;

  const active = plan.filter((item) => !item.skipped);
  if (active.length === 0) fail('nothing to do — every step is skipped');

  console.log('Bringing the rig up (reused where already running, left running after):');
  if (active.some((item) => item.step !== 'grant')) {
    await ensurePreview();
    await ensureProbeHost();
  }
  if (active.some((item) => item.step === 'grant')) await ensureAppium();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => rl.question(question);
  const results = [];
  try {
    const serial = detectAndroidSerial();
    const udid = detectIosUdid();
    let announced = null;
    for (const item of active) {
      if (item.step === 'grant') {
        results.push({ item, ...(await runGrantStep({ udid, ask })) });
        continue;
      }
      if (announced !== item.step) {
        announceHandStep(item.platform, host);
        announced = item.step;
      }
      results.push({ item, ...(await runHandItem(item, { host, serial, seconds, ask })) });
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
    console.log(`  npm run perf:evidence:keep -- --corpus=${OUTPUT_DIR} --campaign=hand-native`);
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
