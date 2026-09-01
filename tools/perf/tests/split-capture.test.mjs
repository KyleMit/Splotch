import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  androidContentOffset,
  androidForegroundPackage,
  androidGestureInstructions,
  androidNativeLaunchSteps,
  androidOpenSteps,
  androidPageLaunchSteps,
  androidRotationCommands,
  CHROME_PACKAGE,
  swipeArgs,
} from '../split-capture/lib/android-input.mjs';
import {
  closeFloorControlHost,
  createFloorControlHost,
} from '../split-capture/serve-floor-control.mjs';
import { createProbeHost } from '../split-capture/lib/probe-host.mjs';
import { fetchAcceptedProbeReport } from '../split-capture/lib/probe-host-protocol.mjs';
import {
  activateChromePage,
  clearToolingLitter,
  runChromePage,
  toolingLitter,
} from '../split-capture/lib/chrome-tabs.mjs';
import {
  androidDriver,
  driveSplitGesturePasses,
  requestPageEraserRefill,
  zeroInputProblem,
} from '../split-capture/capture-device-frames.mjs';
import {
  STROKES_PER_GESTURE_REPEAT,
  trustedGestureActions,
} from '../ios/capture-xcuitest-screen.mjs';
import { guardVerifyForeground } from '../split-capture/verify-android-input.mjs';
import { STAND_DOWN_PATH } from '../split-capture/lib/chrome-tabs.mjs';
import {
  keepIncomingReport,
  reportFileName,
  reportRejectionReason,
} from '../split-capture/lib/report-store.mjs';
import { pageBootstrapSource } from '../split-capture/lib/page-bootstrap.mjs';
import {
  classifyInputCadence,
  describeContactSamples,
} from '../split-capture/lib/input-verdict.mjs';
import {
  calibrationReading,
  firstContactFailure,
  handCaptureArtifact,
  manualOpenLines,
  openWithAdb,
  stalePageFailure,
} from '../split-capture/capture-hand-input.mjs';
import { drivenCaptureArtifact } from '../split-capture/capture-device-frames.mjs';

const directories = [];

// The per-describe teardowns close servers; the temp directories pushed above
// were never removed and accumulated across runs (issue 1309).
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const stroke = [
  { type: 'pointerMove', x: 10, y: 10, duration: 0 },
  { type: 'pointerDown' },
  { type: 'pointerMove', x: 20, y: 10, duration: 120 },
  { type: 'pointerMove', x: 30, y: 10, duration: 120 },
  { type: 'pointerUp' },
];

describe('androidGestureInstructions', () => {
  it('does not confuse authored strokes with Android swipe touch streams', () => {
    const actions = trustedGestureActions({ x: 0, y: 0, width: 1_000, height: 700 }, 1, 0);
    const instructions = androidGestureInstructions(actions);

    expect(actions.filter((action) => action.type === 'pointerDown')).toHaveLength(
      STROKES_PER_GESTURE_REPEAT
    );
    expect(instructions.filter((instruction) => instruction.kind === 'swipe')).toHaveLength(16);
  });

  it('includes Android Chrome content insets in the CSS-to-screen origin', () => {
    expect(
      androidContentOffset(
        {
          viewport: { width: 850, height: 327 },
          outerViewport: { width: 892, height: 412 },
          screenX: 0,
          screenY: 0,
          dpr: 3.5,
        },
        { userRotation: 1 }
      )
    ).toEqual({ x: 147, y: 297.5 });
  });

  it('refuses the mirrored landscape rotation whose inset is on the other edge', () => {
    expect(() =>
      androidContentOffset(
        {
          viewport: { width: 850, height: 327 },
          outerViewport: { width: 892, height: 412 },
          dpr: 3.5,
        },
        { userRotation: 3 }
      )
    ).toThrow('only calibrated for user_rotation=1');
  });

  it('preserves the legacy screen origin when outer geometry is absent', () => {
    expect(
      androidContentOffset({
        viewport: { width: 411, height: 719 },
        screenX: 2,
        screenY: 3,
        dpr: 2,
      })
    ).toEqual({ x: 4, y: 6 });
  });

  it('treats the move before pointerDown as the stroke origin, not a segment', () => {
    const instructions = androidGestureInstructions(stroke);

    // Three points, two segments — the pre-down move contributes the first point.
    expect(instructions.filter((i) => i.kind === 'swipe')).toHaveLength(2);
    expect(instructions[0]).toMatchObject({ x0: 10, y0: 10, x1: 20, y1: 10 });
    expect(instructions[1]).toMatchObject({ x0: 20, y0: 10, x1: 30, y1: 10 });
  });

  it('converts CSS pixels to device pixels through scale and offset', () => {
    const [first] = androidGestureInstructions(stroke, {
      densityScale: 2.75,
      offset: { x: 100, y: 40 },
    });

    expect(first).toMatchObject({ x0: 128, y0: 68, x1: 155, y1: 68 });
  });

  it('never emits a duration short enough for input swipe to fling instead of draw', () => {
    const instructions = androidGestureInstructions([
      { type: 'pointerMove', x: 0, y: 0 },
      { type: 'pointerDown' },
      { type: 'pointerMove', x: 5, y: 0, duration: 3 },
      { type: 'pointerUp' },
    ]);

    expect(instructions[0].durationMs).toBeGreaterThanOrEqual(50);
  });

  it('keeps pauses in order so a multi-stroke plan holds its rhythm', () => {
    const instructions = androidGestureInstructions([
      ...stroke,
      { type: 'pause', duration: 400 },
      ...stroke,
    ]);

    expect(instructions.map((i) => i.kind)).toEqual(['swipe', 'swipe', 'pause', 'swipe', 'swipe']);
    expect(instructions[2].durationMs).toBe(400);
  });

  it('does not leak points across strokes', () => {
    const instructions = androidGestureInstructions([...stroke, ...stroke]);

    // Four segments, not five: the second stroke starts fresh rather than
    // joining the first stroke's last point to its own origin.
    expect(instructions).toHaveLength(4);
  });

  it('renders a swipe as adb arguments', () => {
    expect(swipeArgs({ kind: 'swipe', x0: 1, y0: 2, x1: 3, y1: 4, durationMs: 60 })).toEqual([
      'shell',
      'input',
      'swipe',
      '1',
      '2',
      '3',
      '4',
      '60',
    ]);
  });
});

describe('split-capture eraser pass orchestration', () => {
  it('waits for a refill acknowledgement between authored passes and skips the final refill', async () => {
    const calls = [];
    const driver = {
      async dispatch(_geometry, repeats) {
        calls.push(['dispatch', repeats]);
      },
    };

    const refills = await driveSplitGesturePasses({
      driver,
      geometry: { bounds: {} },
      repeats: 3,
      refillBetweenPasses: async (afterStroke) => {
        calls.push(['refill', afterStroke]);
        return { afterStroke, pending: false, transparentTiles: [] };
      },
    });

    expect(calls).toEqual([
      ['dispatch', 1],
      ['refill', 10],
      ['dispatch', 1],
      ['refill', 20],
      ['dispatch', 1],
    ]);
    expect(refills).toHaveLength(2);
  });

  it('accepts only the nonce-bound acknowledgement for the requested refill token', async () => {
    const controls = [];
    const entry = {
      afterStroke: 10,
      pending: false,
      transparentTiles: [],
      trustedCanvasPointerUps: 16,
    };

    const result = await requestPageEraserRefill({
      host: 'http://probe.test',
      nonce: 'run-1',
      afterStroke: 10,
      controlPage: async (_host, body) => controls.push(body),
      readState: async () => ({
        refill: {
          nonce: 'run-1',
          request: { sequence: 1, afterStroke: 10 },
          entry,
        },
      }),
    });

    expect(controls).toEqual([{ eraserRefillRequest: { sequence: 1, afterStroke: 10 } }]);
    expect(result).toEqual(entry);
  });
});

describe('androidPageLaunchSteps', () => {
  const indexOfArg = (steps, needle) =>
    steps.findIndex((step) => step.args.some((arg) => arg.includes(needle)));

  it('asserts the rotation after force-stopping the browser', () => {
    const steps = androidPageLaunchSteps('LANDSCAPE', 'http://10.0.0.2:4186/');

    // A 2026-08-23 recapture rotated before the stop and lost every landscape cell:
    // the page disagreed with the requested orientation and the capture aborted
    // without writing an artifact. It was attributed to `am force-stop` returning
    // user_rotation to 0 on Samsung/Android 16, and that did not reproduce in 8
    // later trials. The order is pinned because it is free and cannot be the cause
    // of what was seen — see androidPageLaunchSteps.
    expect(indexOfArg(steps, 'force-stop')).toBeLessThan(indexOfArg(steps, 'user_rotation'));
  });

  it('launches the page last, so the browser opens into the settled rotation', () => {
    const steps = androidPageLaunchSteps('LANDSCAPE', 'http://10.0.0.2:4186/');

    expect(indexOfArg(steps, 'user_rotation')).toBeLessThan(indexOfArg(steps, '4186'));
    expect(steps.at(-1).args).toContain(CHROME_PACKAGE);
    expect(steps.at(-1).settle).toBe('page');
  });

  it('settles after the stop and the rotation, which the page launch depends on', () => {
    const steps = androidPageLaunchSteps('PORTRAIT', 'http://10.0.0.2:4186/');

    expect(steps[indexOfArg(steps, 'force-stop')].settle).toBe('appStop');
    expect(steps[indexOfArg(steps, 'user_rotation')].settle).toBe('rotation');
  });
});

describe('androidRotationCommands', () => {
  it('always disables accelerometer rotation alongside setting the rotation', () => {
    const commands = androidRotationCommands('LANDSCAPE');

    // user_rotation is ignored while auto-rotate is on, so setting one without
    // the other yields whichever way the device happens to be lying.
    expect(commands[0]).toContain('accelerometer_rotation');
    expect(commands[0].at(-1)).toBe('0');
    expect(commands[1]).toContain('user_rotation');
    expect(commands[1].at(-1)).toBe('1');
  });

  it('rejects an orientation it cannot express', () => {
    expect(() => androidRotationCommands('SIDEWAYS')).toThrow(/orientation must be one of/);
  });
});

describe('keepIncomingReport', () => {
  const withEvents = (count) => ({ report: { events: Array.from({ length: count }) } });

  it('keeps the first report', () => {
    expect(keepIncomingReport(null, withEvents(0))).toBe(true);
  });

  it('rejects a thinner report from a duplicate Safari navigation', () => {
    expect(keepIncomingReport(withEvents(6000), withEvents(3))).toBe(false);
    expect(reportRejectionReason(withEvents(6000), withEvents(3))).toContain('thinner');
  });

  it('accepts a thicker report that arrives second', () => {
    expect(keepIncomingReport(withEvents(3), withEvents(6000))).toBe(true);
    expect(reportRejectionReason(withEvents(3), withEvents(6000))).toBeNull();
  });

  it('never loses an error report to a thickness comparison', () => {
    // The error is the capture explaining why it produced nothing; dropping it
    // leaves a silent empty run.
    expect(keepIncomingReport(withEvents(6000), { error: 'route never hydrated' })).toBe(true);
  });
});

// Acceptance is nonce-gated, but the on-disk debug copy was label-only — two
// runs sharing a label overwrote each other's file. The nonce is the run
// identity, so it names the file — alone, since mintProbeNonce already embeds
// the label and doubling a long --label breaches the 255-byte filename limit.
describe('reportFileName', () => {
  it('names the file by the plan nonce alone', () => {
    expect(reportFileName({ label: 'pen-portrait', nonce: 'pen-portrait-42-7' })).toBe(
      'pen-portrait-42-7.json'
    );
  });

  it('does not double a long label past the filename component limit', () => {
    const label = 'x'.repeat(120);
    const name = reportFileName({ label, nonce: `${label}-42-7` });
    expect(name).toBe(`${label}-42-7.json`);
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255);
  });

  it('keeps the label-only name for a hand-opened plan carrying no nonce', () => {
    expect(reportFileName({ label: 'run' })).toBe('run.json');
  });
});

describe('pageBootstrapSource', () => {
  it('takes its brush selectors from the capture module rather than duplicating them', () => {
    const source = pageBootstrapSource();

    expect(source).toContain('#crayonBrushButton');
    expect(source).toContain('#eraserButton');
  });

  it('reports the orientation it actually rendered at', () => {
    // The device rotates and the page does not always agree; without this the
    // runner cannot tell a landscape capture filed as portrait.
    expect(pageBootstrapSource()).toContain("innerWidth > innerHeight ? 'LANDSCAPE' : 'PORTRAIT'");
  });

  it('loads the probe as a same-origin script rather than eval', () => {
    // The route's CSP allows script-src 'self' and forbids unsafe-eval.
    const source = pageBootstrapSource();

    expect(source).toContain("element.src = '/__probe/probe.js'");
    expect(source).not.toMatch(/\beval\(/);
  });
});

describe('classifyInputCadence', () => {
  it('fails a capture that recorded no input rather than reporting a rate', () => {
    const { ok, detail } = classifyInputCadence({ movesPerSecond: 0 });

    expect(ok).toBe(false);
    expect(detail).toContain('never reached it');
  });

  it('fails the Appium Android transport at its measured density', () => {
    // 46.8 moves/s at 0.44 moves per frame is what the campaign measured, and
    // every cell captured that way was unscoreable while parsing perfectly.
    const { ok, detail } = classifyInputCadence({
      movesPerSecond: 46.8,
      movesPerFrame: 0.44,
      moveGapP95Ms: 21,
    });

    expect(ok).toBe(false);
    expect(detail).toContain('46.8');
    expect(detail).toContain('cannot be scored');
  });

  it('passes the split transport at its measured density', () => {
    expect(
      classifyInputCadence({ movesPerSecond: 116.6, movesPerFrame: 0.97, moveGapP95Ms: 11 }).ok
    ).toBe(true);
  });

  // The case the rate floor wrongly rejected (ADR-0145): a 60 Hz-locked device
  // driven perfectly delivers ~60 moves/s and cannot do otherwise — the emulator
  // measures 1.09 moves per frame and desktop WebKit exactly 1.0.
  it('passes a 60 Hz-locked stream at full density', () => {
    expect(
      classifyInputCadence({ movesPerSecond: 60.1, movesPerFrame: 1, moveGapP95Ms: 19 }).ok
    ).toBe(true);
  });

  it('fails a live capture that did not measure density', () => {
    expect(classifyInputCadence({ movesPerSecond: 116.6, moveGapP95Ms: 11 }).ok).toBe(false);
  });

  // 240 was written as obviously-too-fast. A real finger on the target iPad
  // measured 268.4 on 2026-08-23, so the rate this asserted on is one a hand
  // produces — the ceiling is retired and an excess rate is reported instead.
  it('accepts a rate above the retired ceiling, because a hand reaches it', () => {
    expect(
      classifyInputCadence({ movesPerSecond: 240, movesPerFrame: 2, moveGapP95Ms: 4 }).ok
    ).toBe(true);
  });

  it('fails a stalling stream even when the mean rate looks fine', () => {
    // A burst-then-stall pattern averages into the band while presenting nothing
    // like a steady cadence.
    const { ok, detail } = classifyInputCadence({
      movesPerSecond: 120,
      movesPerFrame: 1,
      moveGapP95Ms: 45,
    });

    expect(ok).toBe(false);
    expect(detail).toContain('stalls');
  });

  it('does not let iPad-calibrated pressure or geometry decide the verdict', () => {
    // Chrome reports pressure 1 and no contact radius for synthesized touch.
    // Judging Android against Safari's hand-calibrated shape would make this
    // check permanently red and therefore useless.
    const android = {
      movesPerSecond: 116.6,
      movesPerFrame: 0.97,
      moveGapP95Ms: 11,
      pressure: { p50: 1 },
      contactWidth: { p50: 0 },
      contactHeight: { p50: 0 },
    };

    expect(classifyInputCadence(android).ok).toBe(true);
    expect(describeContactSamples(android)).toContain('no contact geometry reported');
  });
});

describe('closeFloorControlHost', () => {
  const listenOnEphemeralPort = async () => {
    const { server } = createFloorControlHost({ log: () => {} });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { server, port: server.address().port };
  };

  // The bug this covers is a process that never exits, so the assertion has to be
  // that the close RESOLVES, not that it was called. Node destroys idle sockets on
  // close() by itself and waits only on ones carrying a request in progress — which
  // is the state the device's browser leaves behind, and the state that has to be
  // reproduced here for the test to mean anything.
  it('resolves while a client holds a socket open mid-request', async () => {
    const { server, port } = await listenOnEphemeralPort();
    const socket = connect(port, '127.0.0.1');
    await new Promise((resolve) => socket.on('connect', resolve));
    socket.write('GET /__probe/plan HTTP/1.1\r\nHost: floor-control\r\n');
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(closeFloorControlHost(server)).resolves.toBeUndefined();
    expect(server.listening).toBe(false);
    socket.destroy();
  });

  it('resolves when nothing ever connected', async () => {
    const { server } = await listenOnEphemeralPort();

    await expect(closeFloorControlHost(server)).resolves.toBeUndefined();
    expect(server.listening).toBe(false);
  });
});

// Issue 1307: the nonce gate was wired into the capture probe host and not this
// one, so a restored floor page could bank an earlier run's cadence under the
// current preflight — the exact acceptance hole demonstrated with an isolated
// HTTP fault injection on 2026-08-25. Same standard as the probe host's test.
describe('the floor host refusing another run’s report', () => {
  const started = [];

  afterEach(async () => {
    for (const server of started.splice(0)) await closeFloorControlHost(server);
  });

  async function floorHostAt() {
    const { server, state } = createFloorControlHost({ log: () => {} });
    started.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { base: `http://127.0.0.1:${server.address().port}`, state };
  }

  const postReport = (base, body) =>
    fetch(`${base}/__probe/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('accepts the current run and rejects a stale one, whatever its size', async () => {
    const { base, state } = await floorHostAt();
    state.plan = { ...state.plan, label: 'new-run', nonce: 'new-run' };

    await postReport(base, { nonce: 'new-run', report: { events: [1, 2, 3] } });
    expect(state.report?.report.events).toHaveLength(3);

    await postReport(base, { nonce: 'old-run', report: { events: Array.from({ length: 99 }) } });
    expect(state.report?.report.events).toHaveLength(3);

    await postReport(base, { report: { events: Array.from({ length: 99 }) } });
    expect(state.report?.report.events).toHaveLength(3);
  });

  it('writes the on-disk debug copy under the run nonce, not the shared label', async () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'splotch-floor-reports-'));
    directories.push(reportDir);
    const { server, state } = createFloorControlHost({ reportDir, log: () => {} });
    started.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    state.plan = { ...state.plan, label: 'same-label', nonce: 'floor-run-1' };

    await postReport(base, { nonce: 'floor-run-1', report: { events: [1] } });

    expect(existsSync(join(reportDir, 'floor-run-1.json'))).toBe(true);
    expect(existsSync(join(reportDir, 'same-label.json'))).toBe(false);
  });
});

describe('the reading a hand capture is kept for', () => {
  // Every field here is read back out of perf-profiles/evidence/*/index.json, so
  // the test is against the names as much as the values.
  const handInput = {
    kinds: 'touch',
    trust: { share: 1 },
    movesPerSecond: 237.82,
    moveGapP95Ms: 17,
    movesPerFrame: 1.96,
    coalescedPerMove: 0,
    pressure: { p50: 0, p95: 0 },
    contactWidth: { p50: 83.42 },
    contactHeight: { p50: 83.42 },
  };

  it('flattens the probe input block into the fields a threshold is set from', () => {
    expect(calibrationReading(handInput)).toEqual({
      kinds: 'touch',
      trustedShare: 1,
      movesPerSecond: 237.82,
      moveGapP95Ms: 17,
      movesPerFrame: 1.96,
      coalescedPerMove: 0,
      pressureP50: 0,
      pressureP95: 0,
      contactWidthP50: 83.42,
      contactHeightP50: 83.42,
    });
  });

  // A runtime that reports nothing for a check is the finding, not a crash: Chrome
  // reports no contact geometry at all, for a real finger and a synthetic one
  // alike, and that absence is what makes the check inapplicable there.
  it('records an absent measurement as null rather than throwing', () => {
    const reading = calibrationReading({ kinds: 'touch', movesPerSecond: 154.63 });
    expect(reading.contactWidthP50).toBeNull();
    expect(reading.pressureP50).toBeNull();
    expect(reading.trustedShare).toBeNull();
    expect(reading.movesPerSecond).toBe(154.63);
  });

  it('survives an input block that is missing entirely', () => {
    expect(calibrationReading().movesPerSecond).toBeNull();
  });
});

// The hand tool took the browser path regardless of --native-app, so it could
// launch Chrome and then record `android-capacitor-webview` as the runtime the
// reading calibrates. Correctly shaped, plausibly labelled, wrong browser.
// The previous version of these tests called the step factories directly, so
// replacing the production dispatch with an unconditional browser launch left
// all of them green — the regression could return under a passing suite. The
// choice is now a value, and this asserts the choice.
describe('which launch a capture takes', () => {
  const args = { orientation: 'LANDSCAPE', pageUrl: 'http://host/?probe=n' };
  const flat = (steps) => steps.flatMap((step) => step.args).join(' ');

  it('reaches the app when the native flag is set', () => {
    const steps = flat(androidOpenSteps({ ...args, nativeApp: true }));

    expect(steps).toContain('art.splotch.app/.MainActivity');
    expect(steps).not.toContain(CHROME_PACKAGE);
  });

  it('reaches the browser when it is not', () => {
    const steps = flat(androidOpenSteps({ ...args, nativeApp: false }));

    expect(steps).toContain(CHROME_PACKAGE);
    expect(steps).toContain(args.pageUrl);
    expect(steps).not.toContain('.MainActivity');
  });

  // An opener that ignores the flag is the shipped bug: it captured Chrome and
  // the artifact recorded android-capacitor-webview.
  it('never returns the same plan for both flag directions', () => {
    expect(flat(androidOpenSteps({ ...args, nativeApp: true }))).not.toBe(
      flat(androidOpenSteps({ ...args, nativeApp: false }))
    );
  });
});

describe('launching the native app instead of the browser', () => {
  const steps = androidNativeLaunchSteps('LANDSCAPE');
  const flat = steps.flatMap((step) => step.args).join(' ');

  it('never touches Chrome', () => {
    expect(flat).not.toContain(CHROME_PACKAGE);
  });

  it('starts the app by activity, with no URL to navigate', () => {
    expect(flat).toContain('art.splotch.app/.MainActivity');
    expect(flat).not.toContain('android.intent.action.VIEW');
  });

  // Same ordering as the browser path, for the same unexplained-but-free reason
  // recorded there: rotation is asserted while the app is stopped.
  it('keeps the stop, rotate, launch ordering', () => {
    expect(steps.map((step) => step.settle)).toEqual(['appStop', null, 'rotation', 'page']);
  });
});

describe('Android native foreground provenance', () => {
  it('reads the resumed package from dumpsys activity output', () => {
    expect(
      androidForegroundPackage(
        'mResumedActivity: ActivityRecord{abc u0 art.splotch.app/.MainActivity t88}'
      )
    ).toBe('art.splotch.app');
    expect(androidForegroundPackage('mResumedActivity: null')).toBeNull();
  });
});

// The theme behaviour is covered by tools/perf/tests/bootstrap-theme.test.mjs,
// which EXECUTES the generated bootstrap in a DOM fixture. Source-substring
// assertions lived here and survived disabling the whole theme branch, so they
// were removed rather than kept alongside a test that works.

describe('what a saved artifact can prove about its own theme', () => {
  const ready = { resolvedTheme: 'dark' };
  const common = { brush: 'pen', orientation: 'LANDSCAPE', theme: 'dark', payload: {} };

  it('records the theme the PAGE reported, on both writers', () => {
    expect(drivenCaptureArtifact({ ...common, ready }).observedTheme).toBe('dark');
    expect(handCaptureArtifact({ ...common, ready }).observedTheme).toBe('dark');
  });

  // The light/system case is why `report.meta.theme` cannot serve as provenance:
  // the product stores the loosest preference that renders an appearance, so
  // choosing the theme the OS already shows clears the override and leaves that
  // field null. `observedTheme` still answers.
  it('answers for a light capture whose report metadata is null', () => {
    const artifact = drivenCaptureArtifact({
      ...common,
      theme: 'light',
      ready: { resolvedTheme: 'light' },
      payload: { report: { meta: { theme: null } } },
    });

    expect(artifact.report.meta.theme).toBeNull();
    expect(artifact.observedTheme).toBe('light');
  });

  // Absent must read as absent rather than as the request, or the field becomes
  // the very echo it replaced.
  it('never falls back to the requested theme when the page reported none', () => {
    expect(drivenCaptureArtifact({ ...common, ready: {} }).observedTheme).toBeNull();
    expect(handCaptureArtifact({ ...common, ready: undefined }).observedTheme).toBeNull();
  });

  // Issue 1297: the repeat count is measurement provenance — campaign acceptance
  // compares it against the plan's contract, so the artifact has to carry it.
  it('records the gesture-repeat count the run was driven at', () => {
    expect(drivenCaptureArtifact({ ...common, ready, gestureRepeats: 10 }).gestureRepeats).toBe(10);
  });

  it('records the measured native package rather than trusting the launch flag', () => {
    expect(
      drivenCaptureArtifact({ ...common, ready, nativeApp: true, nativePackage: 'art.splotch.app' })
    ).toMatchObject({ nativeApp: true, nativePackage: 'art.splotch.app' });
  });

  // Issue 1292: eraser passes get real ink from between-pass refills, which
  // makes old and new eraser numbers incomparable — so the artifact says which
  // plan drove it, and carries the verified-fill and per-refill evidence.
  it('records the gesture plan and both kinds of eraser evidence', () => {
    const eraserFill = { tiles: 16, backings: ['100x80'], transparentTiles: [] };
    const eraserRefills = [{ afterStroke: 10, pending: false, transparentTiles: [] }];
    const artifact = drivenCaptureArtifact({
      ...common,
      brush: 'eraser',
      gesturePlan: 'fixed-geometry-refilled',
      ready: { ...ready, eraserFill },
      payload: { eraserRefills },
    });

    expect(artifact.gesturePlan).toBe('fixed-geometry-refilled');
    expect(artifact.eraserFill).toEqual(eraserFill);
    expect(artifact.eraserRefills).toEqual(eraserRefills);
    expect(drivenCaptureArtifact({ ...common, ready })).toMatchObject({
      gesturePlan: null,
      eraserFill: null,
      eraserRefills: null,
    });
  });
});

// The cross-run race, which produced eleven artifacts whose mode came from one
// page and whose frame tables came from another. Readiness was nonce-checked
// from the start; the report was not, and carried no nonce to check.
describe('a report from a run that is no longer current', () => {
  const withEvents = (n, nonce) => ({ nonce, report: { events: Array.from({ length: n }) } });

  it('is refused even when it is FATTER than what is stored', () => {
    const rejection = reportRejectionReason(
      withEvents(10, 'old-run'),
      withEvents(500, 'old-run'),
      'new-run'
    );

    expect(rejection).toContain('old-run');
    expect(rejection).toContain('new-run');
  });

  // The thinness rule must not be what refuses it, or the log blames the event
  // count for a provenance failure and the next reader goes looking in the wrong
  // place.
  it('names the run rather than the event count', () => {
    expect(reportRejectionReason(null, withEvents(500, 'old-run'), 'new-run')).not.toContain(
      'thinner'
    );
  });

  it('refuses a report that identifies no run at all', () => {
    expect(reportRejectionReason(null, { report: { events: [] } }, 'new-run')).toContain(
      'unidentified'
    );
  });

  it('accepts the run that is current, and still applies thinness within it', () => {
    expect(reportRejectionReason(null, withEvents(500, 'new-run'), 'new-run')).toBeNull();
    expect(
      reportRejectionReason(withEvents(500, 'new-run'), withEvents(1, 'new-run'), 'new-run')
    ).toContain('thinner');
  });

  // An error report is how a failed run reports itself, and it has to survive the
  // check or a real failure is silently discarded.
  it('accepts an error report from the current run', () => {
    expect(reportRejectionReason(null, { nonce: 'new-run', error: 'boom' }, 'new-run')).toBeNull();
  });

  it('carries the nonce on both the success and error paths of the bootstrap', () => {
    const source = pageBootstrapSource();

    expect(source).toContain('nonce,\n      report,');
    expect(source).toContain("post('/__probe/report', { nonce, error:");
  });
});

// The wiring, not the rule. The rejection rule can be perfect while the host
// forgets to hand it the current nonce — which is how this shipped: readiness
// checked the nonce, the report path never received one.
describe('the probe host refusing a stale run over HTTP', () => {
  const started = [];

  afterEach(async () => {
    for (const server of started.splice(0)) await new Promise((r) => server.close(r));
  });

  async function hostAt(reportDir) {
    const { server, state } = createProbeHost({
      upstream: 'http://127.0.0.1:1',
      reportDir,
      log: () => {},
    });
    started.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { base: `http://127.0.0.1:${server.address().port}`, state };
  }

  const postReport = (base, body) =>
    fetch(`${base}/__probe/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('serves only the current accepted report and clears it on reset', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-probe-host-'));
    directories.push(directory);
    const { base } = await hostAt(directory);
    const control = (nonce) =>
      fetch(`${base}/__probe/control`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'same-label', nonce, reset: true }),
      });

    await control('run-1');
    await expect(fetchAcceptedProbeReport(base)).rejects.toThrow('(404)');

    await postReport(base, { nonce: 'stale-run', report: { events: [1] } });
    await expect(fetchAcceptedProbeReport(base)).rejects.toThrow('(404)');

    const accepted = { nonce: 'run-1', report: { events: [1, 2, 3] } };
    await postReport(base, accepted);
    await expect(fetchAcceptedProbeReport(base)).resolves.toEqual(accepted);

    await control('run-2');
    await expect(fetchAcceptedProbeReport(base)).rejects.toThrow('(404)');
  });

  it('keeps two runs sharing a label as two on-disk files', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-probe-host-'));
    directories.push(directory);
    const { base } = await hostAt(directory);
    const control = (nonce) =>
      fetch(`${base}/__probe/control`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'same-label', nonce, reset: true }),
      });

    await control('run-1');
    await postReport(base, { nonce: 'run-1', report: { events: [1] } });
    await control('run-2');
    await postReport(base, { nonce: 'run-2', report: { events: [1, 2] } });

    expect(existsSync(join(directory, 'run-1.json'))).toBe(true);
    expect(existsSync(join(directory, 'run-2.json'))).toBe(true);
  });

  it('names a non-JSON response as a mismatched probe host', async () => {
    const fetchHtml = async () =>
      new Response('<!doctype html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

    await expect(fetchAcceptedProbeReport('http://probe.test', fetchHtml)).rejects.toThrow(
      'did not answer with probe-host JSON'
    );
  });

  // Issue 1316: a locked iPad and an installed clean bundled build both look
  // like a successful devicectl launch followed by silence. The counter is the
  // signal the runner separates them with, so it has to count and to reset.
  it('counts plan requests and zeroes the count on a plan reset', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-probe-host-'));
    directories.push(directory);
    const { base } = await hostAt(directory);

    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).planRequests).toBe(0);
    await fetch(`${base}/__probe/plan`);
    await fetch(`${base}/__probe/plan`);
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).planRequests).toBe(2);

    await fetch(`${base}/__probe/control`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonce: 'next-run', reset: true }),
    });
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).planRequests).toBe(0);
  });

  it('exposes only the current nonce-bound refill acknowledgement and clears it on reset', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-probe-host-'));
    directories.push(directory);
    const { base } = await hostAt(directory);
    const control = (body) =>
      fetch(`${base}/__probe/control`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const postRefill = (body) =>
      fetch(`${base}/__probe/refill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    await control({
      nonce: 'run-1',
      reset: true,
      eraserRefillRequest: { sequence: 1, afterStroke: 10 },
    });
    await postRefill({
      nonce: 'stale-run',
      request: { sequence: 1, afterStroke: 10 },
      entry: { afterStroke: 10 },
    });
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).refill).toBeNull();

    await postRefill({
      nonce: 'run-1',
      request: { sequence: 1, afterStroke: 20 },
      entry: { afterStroke: 20 },
    });
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).refill).toBeNull();

    await postRefill({
      nonce: 'run-1',
      request: { sequence: 1, afterStroke: 10 },
      entry: { afterStroke: 10 },
    });
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).refill).toMatchObject({
      nonce: 'run-1',
      request: { sequence: 1 },
    });

    await control({ nonce: 'run-2', reset: true, eraserRefillRequest: null });
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).refill).toBeNull();
  });

  // A stood-down page used to render a bare <title> while the manual runner
  // waited out its full ready budget — a typo cost three minutes of blank
  // screen. The stand-down body now says what to do, the host exposes the
  // stale-page signal for the current run only, and the manual failure names
  // the exact address to reopen.
  it('serves an instructive stand-down page and exposes the current run’s stale-page signal', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-probe-host-'));
    directories.push(directory);
    const { base } = await hostAt(directory);
    await fetch(`${base}/__probe/control`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'cell', nonce: 'this-run', reset: true }),
    });

    const standDown = await fetch(`${base}/__probe/stand-down`).then((r) => r.text());
    expect(standDown).toContain('stood down');
    expect(standDown).toContain('EXACT');

    const postLog = (body) =>
      fetch(`${base}/__probe/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    await postLog({ kind: 'stale-page', openedFor: 'earlier', nonce: 'another-run' });
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).stalePage).toBeNull();
    await postLog({ kind: 'stale-page', openedFor: 'earlier', nonce: 'this-run' });
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).stalePage).toMatchObject({
      openedFor: 'earlier',
    });

    await fetch(`${base}/__probe/control`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonce: 'next-run', reset: true }),
    });
    expect((await fetch(`${base}/__probe/state`).then((r) => r.json())).stalePage).toBeNull();

    expect(stalePageFailure('http://192.168.0.9:4175/?probe=hand-run-77')).toContain(
      'http://192.168.0.9:4175/?probe=hand-run-77'
    );
  });

  // Issue 1295: the manual path predates the page-identity guard and printed a
  // bare host URL, so hand captures could never prove their run. The printed
  // address must carry the nonce, and must say the query is load-bearing.
  it('prints the nonce-carrying URL for a manual open', () => {
    const text = manualOpenLines({
      pageUrl: 'http://192.168.0.9:4175/?probe=hand-run-77',
      orientation: 'PORTRAIT',
      theme: 'light',
    }).join('\n');

    expect(text).toContain('http://192.168.0.9:4175/?probe=hand-run-77');
    expect(text).toContain('EXACT');
    expect(text).toContain('PORTRAIT');
  });

  it('names both operator-fixable causes when a launch never phones home', () => {
    const message = firstContactFailure('http://192.168.40.53:4175');

    expect(message).toContain('http://192.168.40.53:4175');
    expect(message).toContain('locked');
    expect(message).toContain('perf:build:cap');
  });

  it('keeps a report from the current run and refuses one from another', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-probe-host-'));
    directories.push(directory);
    const { base, state } = await hostAt(directory);
    await fetch(`${base}/__probe/control`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'cell', nonce: 'new-run', reset: true }),
    });

    await postReport(base, { nonce: 'new-run', report: { events: [1, 2, 3] } });
    expect(state.report?.report.events).toHaveLength(3);

    // Fatter, and from the run that just ended. The old code kept it.
    await postReport(base, { nonce: 'old-run', report: { events: Array.from({ length: 99 }) } });

    expect(state.report?.report.events).toHaveLength(3);
    expect(JSON.parse(readFileSync(join(directory, 'new-run.json'), 'utf8')).nonce).toBe('new-run');
  });

  // Issue 1306's last bullet: the ERROR report — the one that exists to stop a
  // number being trusted — is held to the same nonce gate as a data report. A
  // stale run's error must not stand in for this run's diagnosis, and this
  // run's error must not lose to any earlier report's thickness.
  it('accepts the current run’s error report and refuses a stale run’s', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-probe-host-'));
    directories.push(directory);
    const { base, state } = await hostAt(directory);
    await fetch(`${base}/__probe/control`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'cell', nonce: 'new-run', reset: true }),
    });

    await postReport(base, { nonce: 'old-run', error: 'a stale run exploding' });
    expect(state.report).toBeNull();

    await postReport(base, { nonce: 'new-run', report: { events: Array.from({ length: 50 }) } });
    await postReport(base, { nonce: 'new-run', error: 'no sized #drawingCanvas' });
    expect(state.report?.error).toBe('no sized #drawingCanvas');
    expect(JSON.parse(readFileSync(join(directory, 'new-run.json'), 'utf8')).error).toBe(
      'no sized #drawingCanvas'
    );
  });
});

// The CALL SITE, not the chooser. Asserting androidOpenSteps in isolation proved
// it picks correctly when handed the right value and left the original bug fully
// reachable: passing `nativeApp: false` at this call opens Chrome while the
// artifact is still labelled android-capacitor-webview, and every test passed.
describe('the hand capture opening what its flag asked for', () => {
  const commands = async (nativeApp) => {
    const calls = [];
    await openWithAdb({
      serial: 'SERIAL',
      pageUrl: 'http://host/?probe=n',
      orientation: 'PORTRAIT',
      nativeApp,
      exec: (serial, args) => calls.push([serial, ...args].join(' ')),
    });
    return calls.join(' | ');
  };

  it('reaches the app package when --native-app was parsed', async () => {
    const issued = await commands(true);

    expect(issued).toContain('art.splotch.app/.MainActivity');
    expect(issued).not.toContain(CHROME_PACKAGE);
  }, 20_000);

  it('reaches the browser when it was not', async () => {
    const issued = await commands(false);

    expect(issued).toContain(CHROME_PACKAGE);
    expect(issued).not.toContain('.MainActivity');
  }, 20_000);

  it('sends every command to the serial it was given', async () => {
    expect(await commands(true)).toContain('SERIAL');
  }, 20_000);
});

// The hole the nonce check could not close. Chrome restores tabs across the
// force-stop a launch performs; a restored tab re-runs the bootstrap, reads the
// CURRENT plan and adopts its nonce, so it is indistinguishable from the page
// the run opened — while carrying the previous cell's URL and receiving almost
// none of the injected touch. One banked a cell with 517 events where its
// neighbours had 7104.
describe('a page that only adopted the plan', () => {
  const source = pageBootstrapSource();

  it('makes the page prove which run OPENED it', () => {
    expect(source).toContain("new URLSearchParams(location.search).get('probe')");
    expect(source).toContain('openedFor !== nonce');
  });

  // Standing down silently matters: a leftover tab is not a failure, and
  // reporting it as one would bury the real error for the page that IS current.
  it('stands the leftover down rather than failing the run', () => {
    expect(source).toContain("kind: 'stale-page'");
    expect(source.indexOf('openedFor !== nonce')).toBeLessThan(
      source.indexOf("post('/__probe/ready'")
    );
  });
});

describe('fronting the run page', () => {
  const targets = [
    { id: 'a', type: 'page', url: 'http://host:4175/?probe=run-8' },
    { id: 'b', type: 'page', url: 'http://host:4175/?probe=run-84' },
    { id: 'c', type: 'page', url: 'https://www.google.com/m?client=x' },
    { id: 'd', type: 'service_worker', url: 'http://host:4175/sw.js' },
    { id: 'e', type: 'page', url: 'not a url' },
  ];

  it('matches the probe param exactly, so a nonce that prefixes another cannot collide', () => {
    expect(runChromePage(targets, 'run-8')?.id).toBe('a');
    expect(runChromePage(targets, 'run-84')?.id).toBe('b');
    expect(runChromePage(targets, 'run-9')).toBeNull();
  });

  it('activates the run page over the devtools http endpoint and touches nothing else', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return { ok: true, json: async () => targets };
    };

    const result = await activateChromePage({
      cdpBase: 'http://127.0.0.1:9224',
      nonce: 'run-84',
      fetchImpl,
    });

    expect(result.activated).toBe(true);
    expect(calls).toEqual([
      'http://127.0.0.1:9224/json/list',
      'http://127.0.0.1:9224/json/activate/b',
    ]);
  });

  it('leaves an unidentifiable page alone instead of failing or closing anything', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return { ok: true, json: async () => targets };
    };

    const result = await activateChromePage({
      cdpBase: 'http://127.0.0.1:9224',
      nonce: 'absent',
      fetchImpl,
    });

    expect(result).toEqual({ activated: false, pages: 4 });
    expect(calls).toEqual(['http://127.0.0.1:9224/json/list']);
  });
});

describe('clearing the tooling litter', () => {
  const targets = [
    { id: 'run', type: 'page', url: 'http://host:4175/?probe=run-7' },
    { id: 'stale-probe', type: 'page', url: 'http://host:4175/?probe=run-6' },
    { id: 'stale-verify', type: 'page', url: 'http://host:4177/?verify=old-check' },
    { id: 'husk', type: 'page', url: 'http://host:4175/__probe/stand-down' },
    { id: 'blank', type: 'page', url: 'about:blank' },
    { id: 'operator', type: 'page', url: 'https://www.google.com/m?client=x' },
    { id: 'preview', type: 'page', url: 'http://host:4173/' },
    { id: 'other-host', type: 'page', url: 'http://elsewhere:4175/?probe=run-6' },
    { id: 'worker', type: 'service_worker', url: 'http://host:4175/sw.js' },
  ];

  // Ownership is a tool signature on the session host, across every port the
  // tooling serves — the tab that steals the foreground on relaunch is
  // whichever Chrome used last, and a stale probe tab stole the verifier's
  // foreground from a different port exactly this way. A bare about:blank and
  // the host's plain preview pages stay: neither carries a signature that
  // proves it is ours rather than the operator's.
  it('claims tool-signature pages across ports, never operator or unmarked pages', () => {
    const litter = toolingLitter(targets, 'host', 'run-7');

    expect(litter.map((target) => target.id)).toEqual(['stale-probe', 'stale-verify', 'husk']);
  });

  it('closes each leftover over the devtools http endpoint', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return { ok: true, json: async () => targets };
    };

    const result = await clearToolingLitter({
      cdpBase: 'http://127.0.0.1:9224',
      hostname: 'host',
      nonce: 'run-7',
      fetchImpl,
    });

    expect(result).toEqual({ closed: 3, attempted: 3 });
    expect(calls).toEqual([
      'http://127.0.0.1:9224/json/list',
      'http://127.0.0.1:9224/json/close/stale-probe',
      'http://127.0.0.1:9224/json/close/stale-verify',
      'http://127.0.0.1:9224/json/close/husk',
    ]);
  });

  // fetch resolves normally for HTTP 4xx/5xx: a 500 from /json/close must not
  // count as a close (PR 1376 review), and a network throw must not either.
  it('counts only closes the endpoint accepted', async () => {
    const targets = [
      { id: 'ok-tab', type: 'page', url: 'http://host:4175/?probe=stale-1' },
      { id: 'err-tab', type: 'page', url: 'http://host:4175/?probe=stale-2' },
      { id: 'down-tab', type: 'page', url: 'http://host:4175/?probe=stale-3' },
    ];
    const fetchImpl = async (url) => {
      if (url.endsWith('/json/list')) return { ok: true, json: async () => targets };
      if (url.includes('err-tab')) return { ok: false, status: 500 };
      if (url.includes('down-tab')) throw new Error('ECONNREFUSED');
      return { ok: true };
    };
    const result = await clearToolingLitter({
      cdpBase: 'http://127.0.0.1:9224',
      hostname: 'host',
      nonce: 'run-9',
      fetchImpl,
    });
    expect(result).toEqual({ closed: 1, attempted: 3 });
  });
});

describe('the wiring that fronts the page and judges the input', () => {
  const driverDeps = () => {
    const execCalls = [];
    const activateCalls = [];
    const litterCalls = [];
    const forwardCalls = [];
    return {
      execCalls,
      activateCalls,
      litterCalls,
      forwardCalls,
      exec: (serial, args) => execCalls.push(args.join(' ')),
      forward: (cmd, args) => {
        forwardCalls.push(`${cmd} ${args.join(' ')}`);
        return { ok: true, stdout: '', stderr: '' };
      },
      activate: async (options) => {
        activateCalls.push(options);
        return { activated: true, pages: 1 };
      },
      litterClearer: async (options) => {
        litterCalls.push(options);
        return { closed: 0 };
      },
    };
  };

  it('fronts the run page after launch and again before dispatch on the browser path', async () => {
    const deps = driverDeps();
    const driver = androidDriver({
      serial: 's',
      pageUrl: 'http://host:4175/?probe=run-7',
      orientation: 'PORTRAIT',
      nativeApp: false,
      cdpPort: 9224,
      ...deps,
    });

    vi.useFakeTimers();
    try {
      const opened = driver.openPage();
      await vi.runAllTimersAsync();
      await opened;
      const dispatched = driver.dispatch(
        { bounds: { x: 0, y: 0, width: 10, height: 10 }, densityScale: 1, offset: { x: 0, y: 0 } },
        1
      );
      await vi.runAllTimersAsync();
      await dispatched;
    } finally {
      vi.useRealTimers();
    }

    expect(deps.activateCalls.map((call) => call.nonce)).toEqual(['run-7', 'run-7']);
    expect(deps.litterCalls.map((call) => call.hostname)).toEqual(['host', 'host']);
    // --no-rebind refuses to steal a forward another session owns, and the
    // forward never routes through capture(), whose failure path is
    // process.exit — the combination that once killed a preflight.
    expect(deps.execCalls.some((call) => call.startsWith('forward'))).toBe(false);
    expect(deps.forwardCalls).toEqual([
      'adb -s s forward --no-rebind tcp:9224 localabstract:chrome_devtools_remote',
      'adb -s s forward --remove tcp:9224',
      'adb -s s forward --no-rebind tcp:9224 localabstract:chrome_devtools_remote',
      'adb -s s forward --remove tcp:9224',
    ]);
  });

  it('never touches devtools on the native path', async () => {
    const deps = driverDeps();
    const driver = androidDriver({
      serial: 's',
      pageUrl: 'http://host:4175/?probe=run-7',
      orientation: 'PORTRAIT',
      nativeApp: true,
      cdpPort: 9224,
      ...deps,
    });

    vi.useFakeTimers();
    try {
      const opened = driver.openPage();
      await vi.runAllTimersAsync();
      await opened;
      const dispatched = driver.dispatch(
        { bounds: { x: 0, y: 0, width: 10, height: 10 }, densityScale: 1, offset: { x: 0, y: 0 } },
        1
      );
      await vi.runAllTimersAsync();
      await dispatched;
    } finally {
      vi.useRealTimers();
    }

    expect(deps.activateCalls).toEqual([]);
    expect(deps.litterCalls).toEqual([]);
    expect(deps.forwardCalls).toEqual([]);
  });

  it('attests the resumed package on the native path', () => {
    const driver = androidDriver({
      serial: 's',
      pageUrl: 'http://host:4175/?probe=run-7',
      orientation: 'PORTRAIT',
      nativeApp: true,
      cdpPort: 9224,
      exec: (_serial, args) => {
        expect(args).toEqual(['shell', 'dumpsys', 'activity', 'activities']);
        return 'mResumedActivity: ActivityRecord{abc u0 art.splotch.app/.MainActivity t88}';
      },
    });

    expect(driver.runtimeIdentity()).toEqual({ nativePackage: 'art.splotch.app' });
  });

  it('rejects a different resumed package on the native path', () => {
    const driver = androidDriver({
      serial: 's',
      pageUrl: 'http://host:4175/?probe=run-7',
      orientation: 'PORTRAIT',
      nativeApp: true,
      cdpPort: 9224,
      exec: () => 'mResumedActivity: ActivityRecord{abc u0 com.android.chrome/.Main t88}',
    });

    expect(() => driver.runtimeIdentity()).toThrow(
      'the foreground Android package is com.android.chrome, not art.splotch.app'
    );
  });

  it('fails a zero-event dispatch and lets everything else decide downstream', () => {
    expect(zeroInputProblem({ nonce: 'n', events: 0 })).toMatch(/another tab or app/);
    expect(zeroInputProblem({ nonce: 'n', events: 517 })).toBeNull();
    expect(zeroInputProblem(null)).toBeNull();
    expect(zeroInputProblem(undefined)).toBeNull();
  });
});

describe('the pulse the probe host relays', () => {
  const hostFetch = async (server, path, init) => {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
    return response.json();
  };

  it('exposes the run page pulse in state and refuses a stale nonce', async () => {
    const { server } = createProbeHost({ upstream: 'http://127.0.0.1:1', log: () => {} });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await hostFetch(server, '/__probe/control', {
        method: 'PUT',
        body: JSON.stringify({ nonce: 'run-7', reset: true }),
      });
      await hostFetch(server, '/__probe/pulse', {
        method: 'POST',
        body: JSON.stringify({ nonce: 'stale-6', events: 999 }),
      });
      await hostFetch(server, '/__probe/pulse', {
        method: 'POST',
        body: JSON.stringify({ nonce: 'run-7', events: 42 }),
      });
      // Max-not-last, like the report store: on the native paths identity is
      // adopted rather than proven, so a backgrounded leftover pulsing 0 under
      // the current nonce must not overwrite the real page's count.
      await hostFetch(server, '/__probe/pulse', {
        method: 'POST',
        body: JSON.stringify({ nonce: 'run-7', events: 0 }),
      });

      const state = await hostFetch(server, '/__probe/state');
      expect(state.pulse).toEqual({ nonce: 'run-7', events: 42 });

      await hostFetch(server, '/__probe/control', {
        method: 'PUT',
        body: JSON.stringify({ nonce: 'run-8', reset: true }),
      });
      const fresh = await hostFetch(server, '/__probe/state');
      expect(fresh.pulse).toBeNull();
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('the stand-down husk contract', () => {
  // Three consumers of one path: the bootstrap that navigates there, the hosts
  // that must serve it inertly, and the litter matcher. A host missing the
  // route proxies the path to the app, gets a 404 page back WITH the bootstrap
  // injected, and the "inert" husk becomes a self-reloading page on the device
  // being measured — so each side is pinned against the shared constant.
  it('the bootstrap stands stale pages down onto the shared path', () => {
    expect(pageBootstrapSource()).toContain(`location.replace('${STAND_DOWN_PATH}')`);
    expect(pageBootstrapSource()).not.toContain("location.replace('about:blank')");
  });

  it('the probe host serves the husk inertly instead of proxying it', async () => {
    const { server } = createProbeHost({ upstream: 'http://127.0.0.1:1', log: () => {} });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}${STAND_DOWN_PATH}`);
      const body = await response.text();
      // The unreachable upstream proves this did not proxy; a bootstrap tag
      // in the body would prove the husk can resurrect itself.
      expect(response.status).toBe(200);
      expect(body).not.toContain('/__probe/bootstrap.js');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('the floor-control host serves the husk inertly instead of its live page', async () => {
    const { server } = createFloorControlHost({ log: () => {} });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address();
      const body = await fetch(`http://127.0.0.1:${port}${STAND_DOWN_PATH}`).then((r) => r.text());
      expect(body).not.toContain('/__probe/ready');
    } finally {
      await closeFloorControlHost(server);
    }
  });
});

describe('the verify-foreground guard', () => {
  const deps = (overrides = {}) => {
    const forwardCalls = [];
    const litterCalls = [];
    const activateCalls = [];
    return {
      forwardCalls,
      litterCalls,
      activateCalls,
      serial: 's',
      cdpPort: 9234,
      hostname: 'host',
      nonce: 'verify-1',
      forward: (cmd, args) => {
        forwardCalls.push(`${cmd} ${args.join(' ')}`);
        return { ok: true, stdout: '', stderr: '' };
      },
      litterClearer: async (options) => {
        litterCalls.push(options);
        return { closed: 2 };
      },
      activate: async (options) => {
        activateCalls.push(options);
        return { activated: true, pages: 1 };
      },
      ...overrides,
    };
  };

  it('binds with no-rebind on the RESOLVED port and always removes the forward', async () => {
    const d = deps();
    const result = await guardVerifyForeground(d);

    expect(result.guarded).toBe(true);
    expect(d.forwardCalls).toEqual([
      'adb -s s forward --no-rebind tcp:9234 localabstract:chrome_devtools_remote',
      'adb -s s forward --remove tcp:9234',
    ]);
    expect(d.litterCalls[0]).toMatchObject({ hostname: 'host', nonce: 'verify-1' });
    expect(d.activateCalls[0]).toMatchObject({ nonce: 'verify-1', param: 'verify' });
  });

  it('skips without touching a forward it could not bind, and never throws', async () => {
    const d = deps({ forward: () => ({ ok: false, stdout: '', stderr: 'cannot bind listener' }) });
    const result = await guardVerifyForeground(d);

    expect(result.guarded).toBe(false);
    expect(d.litterCalls).toEqual([]);
  });

  it('removes the forward even when the clear rejects', async () => {
    const d = deps({
      litterClearer: async () => {
        throw new Error('socket not up');
      },
    });
    const result = await guardVerifyForeground(d);

    expect(result.guarded).toBe(false);
    expect(d.forwardCalls.at(-1)).toBe('adb -s s forward --remove tcp:9234');
  });
});

// Issue 1323 (Android half): a bundled capture's identity is the DEBUGGER's
// answer for the attached target, and only the app's build-time origin counts —
// a probe-host page or a restored tab must refuse, however healthy it looks.
describe('bundledPageProblem', () => {
  it('accepts only the bundled Capacitor origins', async () => {
    const { bundledPageProblem } = await import('../android/capture-bundled-frames.mjs');
    // The one origin capacitor.config.json fixes (androidScheme https) — a
    // permissive list once accepted http://localhost, which can name locally
    // served content and is exactly the delivery this guard refuses.
    expect(bundledPageProblem('https://localhost/')).toBeNull();
    expect(bundledPageProblem('https://localhost/index.html')).toBeNull();
    expect(bundledPageProblem('http://localhost/')).toMatch(/not the bundled/);
    expect(bundledPageProblem('http://192.168.40.53:4185/?probe=x')).toMatch(/not the bundled/);
    expect(bundledPageProblem('https://localhost.evil.example/')).toMatch(/not the bundled/);
    expect(bundledPageProblem('about:blank')).toMatch(/not the bundled/);
    // A different configured scheme flows through the origin parameter.
    expect(bundledPageProblem('capacitor://localhost/', 'capacitor://localhost')).toBeNull();
  });
});
