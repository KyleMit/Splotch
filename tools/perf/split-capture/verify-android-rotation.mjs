// Prove that an Android device rotates and that a loaded page follows it, before a
// campaign spends its landscape half producing nothing.
//
//   npm run perf:device:verify-android-rotation -- --device-serial=<serial>
//
// The gap this closes is the shape the whole preflight exists for: everything cheap
// passes. `--verify-android-input` drives a real touch and reports a cadence in
// band, and it never rotates the device — so on 2026-08-23 a recapture opened on a
// fully green rig and lost all eight `android-device-web` landscape drawing cells
// before a single artifact was missed. Rotation was asserted for the first time by
// the capture itself, one cell into the queue.
//
// It drives the same launch sequence a capture drives — stop, rotate, launch — and
// reads the orientation the PAGE reports rather than the one the device was asked
// for. Trusting the request is how a landscape capture gets filed as portrait.
//
// The order is deliberate but its stated cause is NOT established. `androidPageLaunchSteps`
// says `am force-stop` returns `user_rotation` to 0 on this Samsung under Android 16;
// a fault injection on 2026-08-23 did observe a LANDSCAPE request coming back
// PORTRAIT with `user_rotation` reading 0, but that read happened after a subsequent
// launch, so it does not isolate force-stop. Review could not reproduce it, and 8
// further trials on R5CRC3AVCXM could not either: `user_rotation` stayed 1 across
// force-stop with Chrome stopped, with Chrome foregrounded first, and across the full
// rotate → force-stop → launch sequence.
//
// So treat stop-before-rotate as the cheap safe ordering rather than as a fix for a
// known mechanism. The failure it guards against is real and was observed once; what
// is unexplained is what caused it. That is also why this verification reads the
// page rather than the setting — whatever the mechanism, the page is the thing a
// capture depends on.
import { argFlag, capture, fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import {
  androidPageLaunchSteps,
  androidRotationRestoreCommands,
  androidRotationVerdict,
} from './lib/android-input.mjs';
import { closeFloorControlHost, createFloorControlHost } from './serve-floor-control.mjs';
import { lanAddress } from './verify-android-input.mjs';

const DEFAULT_PORT = 4177;
const APP_STOP_SETTLE_MS = 1_500;
const ROTATION_SETTLE_MS = 2_500;
const PAGE_SETTLE_MS = 6_000;
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;
// Landscape first: it is the one that fails, so a broken rig reports in half the
// time. Portrait follows to prove the device comes back rather than being stuck the
// other way, which looks identical from a single landscape sample.
const ORIENTATIONS = ['LANDSCAPE', 'PORTRAIT'];
const ROTATION_SETTINGS = ['accelerometer_rotation', 'user_rotation'];

const SETTLE_MS = {
  appStop: APP_STOP_SETTLE_MS,
  rotation: ROTATION_SETTLE_MS,
  page: PAGE_SETTLE_MS,
};

const adb = (serial, args) => capture('adb', ['-s', serial, ...args]);

function readRotationSettings(serial) {
  return Object.fromEntries(
    ROTATION_SETTINGS.map((key) => [
      key,
      adb(serial, ['shell', 'settings', 'get', 'system', key]).trim(),
    ])
  );
}

async function pollFor(callback, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await callback().catch(() => null);
    if (value) return value;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

async function observeOrientation(serial, state, pageUrl, orientation) {
  const nonce = `rotate-${orientation}-${process.pid}-${Math.round(performance.now())}`;
  // Cleared before the launch, not after it: a stale ready payload from the previous
  // orientation would satisfy the poll immediately and report the last answer twice,
  // which reads as a device that rotates perfectly.
  state.progress = null;
  state.plan = { ...state.plan, label: nonce, nonce, finish: false };
  for (const step of androidPageLaunchSteps(orientation, `${pageUrl}?verify=${nonce}`)) {
    adb(serial, step.args);
    if (step.settle) await sleep(SETTLE_MS[step.settle]);
  }
  const ready = await pollFor(async () => state.progress ?? null, READY_TIMEOUT_MS);
  return { requested: orientation, observed: ready?.geometry?.orientation ?? null };
}

export async function verifyAndroidRotation({
  serial = argFlag('device-serial'),
  port = Number(argFlag('port', DEFAULT_PORT)),
  address = argFlag('host-address', lanAddress()),
} = {}) {
  if (!serial) fail('--device-serial= is required');
  if (!address) fail('no non-loopback IPv4 address found — pass --host-address=');

  const { server, state } = createFloorControlHost({ log: () => {} });
  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  // Read before the first write, restore in the finally: this is the only check
  // besides --wake-android that changes device state, and a preflight that leaves a
  // phone rotated is a preflight that corrupts the next session's portrait cells.
  const previous = readRotationSettings(serial);

  try {
    const observations = [];
    for (const orientation of ORIENTATIONS) {
      observations.push(
        await observeOrientation(serial, state, `http://${address}:${port}/`, orientation)
      );
    }
    return { ...androidRotationVerdict(observations), observations, previous };
  } finally {
    for (const args of androidRotationRestoreCommands(previous)) adb(serial, args);
    await closeFloorControlHost(server);
  }
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const result = await verifyAndroidRotation();
    console.log(`${result.ok ? '✓' : '✗'} android rotation ${result.detail}`);
    if (!result.ok) process.exitCode = 1;
  });
}
