// Prove that synthesized touch reaches an Android page at usable fidelity,
// before a campaign spends hours producing captures that cannot be scored.
//
//   npm run perf:device:verify-android -- --device-serial=<serial>
//
// The counterpart to the iOS launch probe, and the check whose absence let the
// Android cadence defect survive a whole campaign: every preflight check was
// host-side, every capture parsed, and the input was simply too sparse to
// measure anything.
//
// It drives the FLOOR CONTROL rather than the app — one canvas, one stroke per
// pointermove, served from this host — so the answer is about the input path
// alone. A slow app cannot make this fail and a fast one cannot make it pass,
// and it needs no product build.
import { networkInterfaces } from 'node:os';
import { argFlag, capture, fail, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { inputFidelity, trustedGestureActions } from '../ios/capture-xcuitest-screen.mjs';
import { summarizeRun } from '../lib/real-screen-stats.mjs';
import { androidGestureInstructions, swipeArgs } from './lib/android-input.mjs';
import { classifyInputCadence, describeContactSamples } from './lib/input-verdict.mjs';
import { closeFloorControlHost, createFloorControlHost } from './serve-floor-control.mjs';

const DEFAULT_PORT = 4177;
const PAGE_SETTLE_MS = 6_000;
const APP_STOP_SETTLE_MS = 1_500;
const READY_TIMEOUT_MS = 60_000;
const REPORT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;
const GESTURE_TAIL_MS = 1_200;
// Long enough for a cadence estimate to settle, short enough that a preflight
// stays a preflight.
const GESTURE_REPEATS = 4;
const CONTACT_BANK_MS = 600_000;

const adb = (serial, args) => capture('adb', ['-s', serial, ...args]);

// The device loads this over the LAN, so loopback is useless. Picked rather than
// required, because a wrong guess here fails as "the page never loaded" and
// costs far more to diagnose than it saves.
export function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
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

export async function verifyAndroidInput({
  serial = argFlag('device-serial'),
  port = Number(argFlag('port', DEFAULT_PORT)),
  address = argFlag('host-address', lanAddress()),
  repeats = Number(argFlag('gesture-repeats', GESTURE_REPEATS)),
} = {}) {
  if (!serial) fail('--device-serial= is required');
  if (!address) fail('no non-loopback IPv4 address found — pass --host-address=');

  const { server, state } = createFloorControlHost({ log: () => {} });
  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  const host = `http://127.0.0.1:${port}`;
  const nonce = `verify-${process.pid}-${Math.round(performance.now())}`;
  state.plan = { ...state.plan, label: nonce, nonce, finish: false, contactMs: CONTACT_BANK_MS };

  try {
    adb(serial, ['shell', 'am', 'force-stop', 'com.android.chrome']);
    await sleep(APP_STOP_SETTLE_MS);
    adb(serial, [
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      `'http://${address}:${port}/?verify=${nonce}'`,
      'com.android.chrome',
    ]);
    await sleep(PAGE_SETTLE_MS);

    const ready = await pollFor(
      async () => (await fetch(`${host}/__probe/state`).then((r) => r.json())).ready,
      READY_TIMEOUT_MS
    );
    if (!ready) {
      fail(
        `the floor control never reported ready on http://${address}:${port} — ` +
          'the phone could not load it. Check that the host is reachable from the device.'
      );
    }

    const geometry = ready.geometry;
    const instructions = androidGestureInstructions(
      trustedGestureActions(geometry.canvas, repeats, 0),
      {
        densityScale: geometry.dpr,
        offset: { x: geometry.screenX * geometry.dpr, y: geometry.screenY * geometry.dpr },
      }
    );
    for (const instruction of instructions) {
      if (instruction.kind === 'pause') await sleep(instruction.durationMs);
      else adb(serial, swipeArgs(instruction));
    }
    await sleep(GESTURE_TAIL_MS);
    state.plan = { ...state.plan, finish: true };

    const uploaded = await pollFor(async () => state.report ?? null, REPORT_TIMEOUT_MS);
    if (!uploaded) fail('the page never uploaded a report');
    if (uploaded.error) fail(uploaded.error);

    const summaries = summarizeRun(uploaded.report);
    const input = summaries.phases?.[0]?.input ?? {};
    const cadence = classifyInputCadence(input);
    return {
      ok: cadence.ok,
      detail: cadence.detail,
      contact: describeContactSamples(input),
      input,
      summaries,
      report: uploaded.report,
      // Reported for completeness; its pressure and contactGeometry checks are
      // calibrated for the iPad, so they are not what decides this.
      fidelity: inputFidelity(input),
    };
  } finally {
    await closeFloorControlHost(server);
  }
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const result = await verifyAndroidInput();
    console.log(`${result.ok ? '✓' : '✗'} android input   ${result.detail}`);
    if (result.contact) console.log(`  observed: ${result.contact}`);
    if (!result.ok) process.exitCode = 1;
  });
}
