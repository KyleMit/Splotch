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
import { trustedGestureActions } from '../ios/capture-xcuitest-screen.mjs';
import { inputFidelity } from '../lib/input-fidelity.mjs';
import { summarizeRun } from '../lib/real-screen-stats.mjs';
import {
  ANDROID_DISPLAY_INSETS_ARGS,
  androidContentOffset,
  androidGestureInstructions,
  androidSystemInsets,
  swipeArgs,
} from './lib/android-input.mjs';
import { pollFor } from './lib/poll.mjs';
import { classifyInputCadence, describeContactSamples } from './lib/input-verdict.mjs';
import { closeFloorControlHost, createFloorControlHost } from './serve-floor-control.mjs';
import { activateChromePage, clearToolingLitter } from './lib/chrome-tabs.mjs';
import { PORT_ROLES } from '../lib/capture-readiness.mjs';
import { adbRunner, reverseToLocalhost } from '../lib/android-localhost-route.mjs';

const DEFAULT_PORT = 4177;
const PAGE_SETTLE_MS = 6_000;
const APP_STOP_SETTLE_MS = 1_500;
const READY_TIMEOUT_MS = 60_000;
const REPORT_TIMEOUT_MS = 60_000;
const GESTURE_TAIL_MS = 1_200;
// Long enough for a cadence estimate to settle, short enough that a preflight
// stays a preflight.
const PREFLIGHT_GESTURE_REPEATS = 4;
const CONTACT_BANK_MS = 600_000;

const adb = (serial, args) => capture('adb', ['-s', serial, ...args]);

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
  hostnames,
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
    const cleared = await litterClearer({ cdpBase, hostnames, nonce });
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
  repeats = Number(argFlag('gesture-repeats', PREFLIGHT_GESTURE_REPEATS)),
} = {}) {
  if (!serial) fail('--device-serial= is required');
  if (!Number.isSafeInteger(repeats) || repeats < 1) {
    fail('--gesture-repeats must be a positive integer');
  }

  const { server, state } = createFloorControlHost({ log: () => {} });
  await new Promise((resolve) => server.listen(port, '0.0.0.0', resolve));
  const host = `http://127.0.0.1:${port}`;
  const route = await reverseToLocalhost(host, adbRunner(serial));
  const pageBase = new URL(route.url);
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
      `'${pageBase.origin}/?verify=${nonce}'`,
      'com.android.chrome',
    ]);
    await sleep(PAGE_SETTLE_MS);
    await guardVerifyForeground({ serial, cdpPort, hostnames: route.toolingHostnames, nonce });

    const ready = await pollFor(
      async () => (await fetch(`${host}/__probe/state`).then((r) => r.json())).ready,
      READY_TIMEOUT_MS
    );
    // Chrome lazy-restores tabs across the whole readiness window, so the
    // capture path fronts its page again right before dispatching — a
    // preflight proves the operations it performs, so this one performs the
    // same two.
    if (ready)
      await guardVerifyForeground({ serial, cdpPort, hostnames: route.toolingHostnames, nonce });
    if (!ready) {
      fail(
        `the floor control never reported ready at ${pageBase.origin} (adb reverse of ` +
          `tcp:${port}) — the phone's Chrome did not load it. Unlock the phone and check ` +
          'that Chrome is in front of anything else on its screen.'
      );
    }

    const geometry = ready.geometry;
    const userRotation = Number.parseInt(
      adb(serial, ['shell', 'settings', 'get', 'system', 'user_rotation']).trim(),
      10
    );
    const instructions = androidGestureInstructions(
      trustedGestureActions(geometry.canvas, repeats, 0),
      {
        densityScale: geometry.dpr,
        offset: androidContentOffset(geometry, {
          userRotation,
          systemInsets: androidSystemInsets(adb(serial, ANDROID_DISPLAY_INSETS_ARGS)),
        }),
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
    route.release();
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
