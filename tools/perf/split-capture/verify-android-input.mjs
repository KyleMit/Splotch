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
import { argFlag, capture, fail, isMain, runMain, sleep, tryCapture } from '../../lib/proc.mjs';
import { lanAddresses } from '../../lib/net.mjs';
import { trustedGestureActions } from '../ios/capture-xcuitest-screen.mjs';
import { inputFidelity } from '../lib/input-fidelity.mjs';
import { summarizeRun } from '../lib/real-screen-stats.mjs';
import { androidGestureInstructions, swipeArgs } from './lib/android-input.mjs';
import { classifyInputCadence, describeContactSamples } from './lib/input-verdict.mjs';
import { closeFloorControlHost, createFloorControlHost } from './serve-floor-control.mjs';
import { activateChromePage, clearToolingLitter } from './lib/chrome-tabs.mjs';
import { PORT_ROLES } from '../lib/capture-readiness.mjs';

const DEFAULT_PORT = 4177;
const PAGE_SETTLE_MS = 6_000;
const APP_STOP_SETTLE_MS = 1_500;
const READY_TIMEOUT_MS = 60_000;
const REPORT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;
const GESTURE_TAIL_MS = 1_200;
// Long enough for a cadence estimate to settle, short enough that a preflight
// stays a preflight.
const PREFLIGHT_GESTURE_REPEATS = 4;
const CONTACT_BANK_MS = 600_000;

const adb = (serial, args) => capture('adb', ['-s', serial, ...args]);

// The device loads this over the LAN, so loopback is useless. Picked rather than
// required, because a wrong guess here fails as "the page never loaded" and
// costs far more to diagnose than it saves. Delegates to the shared enumerator
// rather than re-deriving: a local copy that skipped its link-local filter
// agreed with it only by OS enumeration order, and the USB-tethered iPad's
// 169.254 interface sits on exactly this rig.
export function lanAddress() {
  return lanAddresses()[0] ?? null;
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

// The same restored-tab race the capture runner guards against: session
// restore across the force-stop can front a stale tab while the verify page
// loads behind it, and the verifier then reports zero pointer input on a
// healthy rig. Genuinely best-effort, which capture() cannot be — its failure
// path is process.exit, which no catch intercepts, and a bound forward port
// once killed a whole preflight through exactly that combination. Every step
// here reports and continues; the zero-input verdict downstream names the
// failure. --no-rebind refuses to steal a forward another session owns, and
// the removal runs in finally so nothing stays attached while input is
// measured.
export async function guardVerifyForeground({
  serial,
  cdpPort,
  hostname,
  nonce,
  forward = tryCapture,
  litterClearer = clearToolingLitter,
  activate = activateChromePage,
}) {
  const bound = forward('adb', [
    '-s',
    serial,
    'forward',
    '--no-rebind',
    `tcp:${cdpPort}`,
    'localabstract:chrome_devtools_remote',
  ]);
  if (!bound.ok) {
    console.log(
      `  (tab guard skipped: forward tcp:${cdpPort} unavailable — ${bound.stderr.trim()})`
    );
    return { guarded: false };
  }
  try {
    const cdpBase = `http://127.0.0.1:${cdpPort}`;
    const cleared = await litterClearer({ cdpBase, hostname, nonce });
    const fronted = await activate({ cdpBase, nonce, param: 'verify' });
    if (!fronted.activated) {
      console.log(
        `  (could not identify the verify page among ${fronted.pages} tab(s); ` +
          `cleared ${cleared.closed} leftover(s))`
      );
    }
    return { guarded: true, cleared: cleared.closed, activated: fronted.activated };
  } catch (error) {
    console.log(`  (tab guard unavailable: ${error?.message ?? error})`);
    return { guarded: false };
  } finally {
    forward('adb', ['-s', serial, 'forward', '--remove', `tcp:${cdpPort}`]);
  }
}

export async function verifyAndroidInput({
  serial = argFlag('device-serial'),
  port = Number(argFlag('port', DEFAULT_PORT)),
  // The caller that knows better passes the RESOLVED port — prepare-capture
  // shifts this role off a held 9224, and a hardcoded default here would bind
  // the port the preflight just said it was avoiding.
  cdpPort = Number(argFlag('cdp-port', PORT_ROLES.androidCdp.port)),
  address = argFlag('host-address', lanAddress()),
  repeats = Number(argFlag('gesture-repeats', PREFLIGHT_GESTURE_REPEATS)),
} = {}) {
  if (!serial) fail('--device-serial= is required');
  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    fail('--gesture-repeats must be a positive integer');
  }
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
    await guardVerifyForeground({ serial, cdpPort, hostname: address, nonce });

    const ready = await pollFor(
      async () => (await fetch(`${host}/__probe/state`).then((r) => r.json())).ready,
      READY_TIMEOUT_MS
    );
    // Chrome lazy-restores tabs across the whole readiness window, so the
    // capture path fronts its page again right before dispatching — a
    // preflight proves the operations it performs, so this one performs the
    // same two.
    if (ready) await guardVerifyForeground({ serial, cdpPort, hostname: address, nonce });
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
      // Reported for completeness; Chrome on Android has no calibrated expectation
      // for coalescing, pressure or contact geometry yet, so cadence is what
      // decides this.
      fidelity: inputFidelity(input, 'android-chrome'),
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
