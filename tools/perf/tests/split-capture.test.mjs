import { connect } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  androidGestureInstructions,
  androidNativeLaunchSteps,
  androidPageLaunchSteps,
  androidRotationCommands,
  CHROME_PACKAGE,
  swipeArgs,
} from '../split-capture/lib/android-input.mjs';
import {
  closeFloorControlHost,
  createFloorControlHost,
} from '../split-capture/serve-floor-control.mjs';
import { keepIncomingReport, reportRejectionReason } from '../split-capture/lib/report-store.mjs';
import { pageBootstrapSource } from '../split-capture/lib/page-bootstrap.mjs';
import {
  classifyInputCadence,
  describeContactSamples,
} from '../split-capture/lib/input-verdict.mjs';
import { calibrationReading } from '../split-capture/capture-hand-input.mjs';

const stroke = [
  { type: 'pointerMove', x: 10, y: 10, duration: 0 },
  { type: 'pointerDown' },
  { type: 'pointerMove', x: 20, y: 10, duration: 120 },
  { type: 'pointerMove', x: 30, y: 10, duration: 120 },
  { type: 'pointerUp' },
];

describe('androidGestureInstructions', () => {
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

  it('fails the Appium Android transport at its measured rate', () => {
    // 46.8 moves/s is what the campaign measured, and every cell captured that
    // way was unscoreable while parsing perfectly.
    const { ok, detail } = classifyInputCadence({ movesPerSecond: 46.8, moveGapP95Ms: 21 });

    expect(ok).toBe(false);
    expect(detail).toContain('46.8');
    expect(detail).toContain('cannot be scored');
  });

  it('passes the split transport at its measured rate', () => {
    expect(classifyInputCadence({ movesPerSecond: 116.6, moveGapP95Ms: 11 }).ok).toBe(true);
  });

  // 240 was written as obviously-too-fast. A real finger on the target iPad
  // measured 268.4 on 2026-08-23, so the rate this asserted on is one a hand
  // produces — the ceiling is retired and an excess rate is reported instead.
  it('accepts a rate above the retired ceiling, because a hand reaches it', () => {
    expect(classifyInputCadence({ movesPerSecond: 240, moveGapP95Ms: 4 }).ok).toBe(true);
  });

  it('fails a stalling stream even when the mean rate looks fine', () => {
    // A burst-then-stall pattern averages into the band while presenting nothing
    // like a steady cadence.
    const { ok, detail } = classifyInputCadence({ movesPerSecond: 120, moveGapP95Ms: 45 });

    expect(ok).toBe(false);
    expect(detail).toContain('stalls');
  });

  it('does not let iPad-calibrated pressure or geometry decide the verdict', () => {
    // Chrome reports pressure 1 and no contact radius for synthesized touch.
    // Judging Android against Safari's hand-calibrated shape would make this
    // check permanently red and therefore useless.
    const android = {
      movesPerSecond: 116.6,
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
